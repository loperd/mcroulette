// Small CPU path tracer for asset evidence where GPU applications are unavailable.
// glTF decoding is in review-relic.py. This consumes the decoded final GLB,
// including texture pixels, triangle normals and metallic/roughness materials.
// Cook-Torrance GGX + Lambert, next-event area-light sampling, MIS, four bounces.
// No baked shading, screen-space AO, bloom, painted highlights or face tinting.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <numeric>
#include <string>
#include <thread>
#include <vector>

constexpr double PI=3.14159265358979323846, EPS=1e-5;
struct V {
 double x=0,y=0,z=0;
 V()=default; V(double X,double Y,double Z):x(X),y(Y),z(Z){}
 V operator+(V b)const{return {x+b.x,y+b.y,z+b.z};}
 V operator-(V b)const{return {x-b.x,y-b.y,z-b.z};}
 V operator-()const{return {-x,-y,-z};}
 V operator*(double a)const{return {x*a,y*a,z*a};}
 V operator/(double a)const{return *this*(1/a);}
 V operator*(V b)const{return {x*b.x,y*b.y,z*b.z};}
 double operator[](int a)const{return a==0?x:a==1?y:z;}
};
double dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
V cross(V a,V b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
double length(V a){return std::sqrt(dot(a,a));}
V unit(V a){return a/std::max(1e-12,length(a));}
V vmin(V a,V b){return {std::min(a.x,b.x),std::min(a.y,b.y),std::min(a.z,b.z)};}
V vmax(V a,V b){return {std::max(a.x,b.x),std::max(a.y,b.y),std::max(a.z,b.z)};}
double maxc(V a){return std::max({a.x,a.y,a.z});}
double sat(double x){return std::clamp(x,0.,1.);}
struct RNG {
 uint64_t state;
 explicit RNG(uint64_t s):state(s+0x9e3779b97f4a7c15ULL){}
 double next(){state^=state>>12;state^=state<<25;state^=state>>27;return ((state*2685821657736338717ULL)>>11)*0x1.0p-53;}
};
struct Ray {V o,d;};
struct Triangle {V p[3],n;double uv[3][2];int material=0,light=-1;};
struct Material {V base,emission;double metal=0,rough=.8;int tex=-1,orm=-1,normal=-1,emissive=-1,ao=-1;double normalScale=1,aoStrength=1;};
struct Texture {int w,h;std::vector<V> rgb;};
struct Box {
 V lo{1e30,1e30,1e30},hi{-1e30,-1e30,-1e30};
 void add(V p){lo=vmin(lo,p);hi=vmax(hi,p);}
 bool hit(Ray r,double maxT)const{
  double near=EPS,far=maxT;
  for(int a=0;a<3;a++){
   if(std::abs(r.d[a])<1e-12){if(r.o[a]<lo[a]||r.o[a]>hi[a])return false;continue;}
   double t0=(lo[a]-r.o[a])/r.d[a],t1=(hi[a]-r.o[a])/r.d[a];
   if(t0>t1)std::swap(t0,t1);near=std::max(near,t0);far=std::min(far,t1);if(far<near)return false;
  }return true;
 }
};
struct Node {Box box;int left=-1,right=-1,start=0,count=0;};
struct Hit {double t=1e30,u=0,v=0;int tri=-1;};
struct Light {V center,u,v,power;double area;};
std::vector<Triangle> tris;std::vector<Material> mats;std::vector<Texture> textures;
std::vector<Node> nodes;std::vector<int> order;std::vector<Light> lights;
int build(int begin,int end){
 int index=int(nodes.size());nodes.push_back({});Box bounds,centers;
 for(int i=begin;i<end;i++){auto&t=tris[order[i]];for(V p:t.p)bounds.add(p);centers.add((t.p[0]+t.p[1]+t.p[2])/3);}
 nodes[index].box=bounds;
 if(end-begin<=6){nodes[index].start=begin;nodes[index].count=end-begin;return index;}
 V span=centers.hi-centers.lo;int axis=span.x>span.y?(span.x>span.z?0:2):(span.y>span.z?1:2);int mid=(begin+end)/2;
 std::nth_element(order.begin()+begin,order.begin()+mid,order.begin()+end,[axis](int a,int b){
  return (tris[a].p[0][axis]+tris[a].p[1][axis]+tris[a].p[2][axis])<(tris[b].p[0][axis]+tris[b].p[1][axis]+tris[b].p[2][axis]);});
 int left=build(begin,mid),right=build(mid,end);nodes[index].left=left;nodes[index].right=right;return index;
}
bool intersect(Ray r,Hit&h,bool camera=false){
 int stack[128],count=1;stack[0]=0;
 while(count){auto&node=nodes[stack[--count]];if(!node.box.hit(r,h.t))continue;
  if(!node.count){stack[count++]=node.left;stack[count++]=node.right;continue;}
  for(int i=0;i<node.count;i++){
   int id=order[node.start+i];auto&t=tris[id];if(camera&&t.light>=0)continue;V e1=t.p[1]-t.p[0],e2=t.p[2]-t.p[0],p=cross(r.d,e2);double det=dot(e1,p);
   if(std::abs(det)<1e-12)continue;double inv=1/det;V delta=r.o-t.p[0];double u=dot(delta,p)*inv;
   if(u<0||u>1)continue;V q=cross(delta,e1);double v=dot(r.d,q)*inv;if(v<0||u+v>1)continue;
   double d=dot(e2,q)*inv;if(d>EPS&&d<h.t)h={d,u,v,id};
  }
 }return h.tri>=0;
}
V textureSample(int index,const Triangle&t,const Hit&hit){
 if(index<0)return {1,1,1};auto&tex=textures[index];double w=1-hit.u-hit.v;
 double u=t.uv[0][0]*w+t.uv[1][0]*hit.u+t.uv[2][0]*hit.v;
 double v=t.uv[0][1]*w+t.uv[1][1]*hit.u+t.uv[2][1]*hit.v;
 int x=std::clamp(int(u*tex.w),0,tex.w-1),y=std::clamp(int(v*tex.h),0,tex.h-1);
 return tex.rgb[y*tex.w+x];
}
V tangent(V n){return unit(cross(std::abs(n.y)<.99?V{0,1,0}:V{1,0,0},n));}
V local(V p,V n){V t=tangent(n);return t*p.x+cross(n,t)*p.y+n*p.z;}
V cosine(V n,RNG&rng){double u=rng.next(),phi=2*PI*rng.next();return local({std::sqrt(u)*std::cos(phi),std::sqrt(u)*std::sin(phi),std::sqrt(1-u)},n);}
double ggxD(double nh,double rough){double a=rough*rough,a2=a*a,b=nh*nh*(a2-1)+1;return a2/(PI*b*b);}
double smith(double nx,double rough){double a=rough*rough;return 2*nx/(nx+std::sqrt(a*a+(1-a*a)*nx*nx));}
double specProbability(double metal){return .25+.65*metal;}
V fresnel(V f0,double vh){return f0+(V{1,1,1}-f0)*std::pow(1-sat(vh),5);}
V bsdf(V n,V wo,V wi,V color,const Material&m){
 double nl=dot(n,wi),nv=dot(n,wo);if(nl<=0||nv<=0)return {};
 V h=unit(wo+wi);double nh=std::max(0.,dot(n,h)),vh=std::max(0.,dot(wo,h));
 V F=fresnel(V{.04,.04,.04}*(1-m.metal)+color*m.metal,vh);
 V diffuse=(V{1,1,1}-F)*color*((1-m.metal)/PI);
 return diffuse+F*(ggxD(nh,m.rough)*smith(nv,m.rough)*smith(nl,m.rough)/(4*nv*nl));
}
double pdf(V n,V wo,V wi,const Material&m){
 double nl=dot(n,wi);if(nl<=0)return 0;V h=unit(wo+wi);double vh=std::max(1e-9,dot(wo,h));double p=specProbability(m.metal);
 return (1-p)*nl/PI+p*ggxD(std::max(0.,dot(n,h)),m.rough)*std::max(0.,dot(n,h))/(4*vh);
}
V sampleBSDF(V n,V wo,const Material&m,RNG&rng){
 if(rng.next()>=specProbability(m.metal))return cosine(n,rng);
 double a=m.rough*m.rough,u=rng.next(),phi=2*PI*rng.next();double c=std::sqrt((1-u)/(1+(a*a-1)*u));
 V h=local({std::sqrt(1-c*c)*std::cos(phi),std::sqrt(1-c*c)*std::sin(phi),c},n);return h*(2*dot(wo,h))-wo;
}
double powerWeight(double a,double b){return a*a/(a*a+b*b+1e-30);}
double lightPdf(int i,V from,V to){auto&l=lights[i];V d=to-from;double dist2=dot(d,d),c=std::abs(dot(unit(cross(l.u,l.v)),-unit(d)));return dist2/(l.area*std::max(c,1e-9)*lights.size());}
// Optional review controls. Defaults preserve earlier evidence. Surface-only
// emission avoids implying glTF raster emission lights neighboring surfaces.
double studioScale=1;bool surfaceEmissionOnly=false;
V trace(Ray ray,RNG&rng,bool clay){
 V throughput{1,1,1},radiance{},previous{};double previousPdf=0;
 for(int bounce=0;bounce<5;bounce++){
  Hit hit;if(!intersect(ray,hit,bounce==0)){V sky=V{.12,.12,.12}*studioScale;radiance=radiance+throughput*sky;break;}
  auto&t=tris[hit.tri];Material m=mats[t.material];V p=ray.o+ray.d*hit.t,n=t.n,wo=-ray.d;
  if(dot(n,wo)<0)n=-n;
  V color=m.base*textureSample(m.tex,t,hit);double ao=1;
  if(!clay&&t.light<0){
   V orm=textureSample(m.orm,t,hit);m.rough=std::clamp(m.rough*orm.y,.045,1.);m.metal*=orm.z;
   m.emission=m.emission*textureSample(m.emissive,t,hit);ao=1-m.aoStrength*(1-textureSample(m.ao,t,hit).x);
   if(m.normal>=0){
    double du1=t.uv[1][0]-t.uv[0][0],dv1=t.uv[1][1]-t.uv[0][1],du2=t.uv[2][0]-t.uv[0][0],dv2=t.uv[2][1]-t.uv[0][1],det=du1*dv2-du2*dv1;
    if(std::abs(det)>1e-14){V e1=t.p[1]-t.p[0],e2=t.p[2]-t.p[0],T=unit((e1*dv2-e2*dv1)/det),B=unit((e2*du1-e1*du2)/det),map=textureSample(m.normal,t,hit)*2-V{1,1,1};
     V perturbed=unit(T*(map.x*m.normalScale)+B*(map.y*m.normalScale)+n*map.z);if(dot(perturbed,wo)>0)n=perturbed;
    }
   }
  }
  if(clay&&t.light<0&&t.material!=int(mats.size())-1){color={.36,.36,.36};m.metal=0;m.rough=.75;m.emission={};}
  if(maxc(m.emission)>0&&(!surfaceEmissionOnly||bounce==0||t.light>=0)){double weight=1;
   if(t.light>=0&&bounce>0)weight=powerWeight(previousPdf,lightPdf(t.light,previous,p));
   radiance=radiance+throughput*m.emission*weight;
  }
  if(t.light>=0)break;
  int li=std::min(int(lights.size())-1,int(rng.next()*lights.size()));auto&light=lights[li];
  V sample=light.center+light.u*(rng.next()-.5)+light.v*(rng.next()-.5),delta=sample-p;double dist=length(delta);V wi=delta/dist;
  double nl=dot(n,wi);
  if(nl>0){Hit shadow;shadow.t=dist-2*EPS;
   if(!intersect({p+n*EPS,wi},shadow)){
    double lp=lightPdf(li,p,sample),bp=pdf(n,wo,wi,m);
    radiance=radiance+throughput*bsdf(n,wo,wi,color,m)*light.power*(nl*powerWeight(lp,bp)/lp);
   }
  }
  V wi2=sampleBSDF(n,wo,m,rng);double nl2=dot(n,wi2),bp=pdf(n,wo,wi2,m);if(nl2<=0||bp<1e-10)break;
  throughput=throughput*bsdf(n,wo,wi2,color,m)*(nl2/bp)*ao;
  previous=p;previousPdf=bp;ray={p+n*EPS,unit(wi2)};
  if(bounce>=2){double survive=std::clamp(maxc(throughput),.05,.95);if(rng.next()>survive)break;throughput=throughput/survive;}
 }return radiance;
}
void rectangle(V c,V u,V v,int mat,int light=-1){
 V p[4]={c-u*.5-v*.5,c+u*.5-v*.5,c+u*.5+v*.5,c-u*.5+v*.5};
 for(auto ids:{std::vector<int>{0,1,2},std::vector<int>{0,2,3}}){Triangle t;for(int i=0;i<3;i++)t.p[i]=p[ids[i]];t.n=unit(cross(u,v));t.material=mat;t.light=light;tris.push_back(t);}
}
void studio(int mode=0){
 struct Setup {V p;double size,power,height=0;};
 std::vector<Setup> setups=mode==1?std::vector<Setup>{{{-2.3,2.4,-3.1},1.0,40.0},{{3.0,1.7,-1.0},1.4,16.0},{{.4,3.4,3.6},1.1,32.0}}:std::vector<Setup>{{{-2.7,3.5,-3.3},2.7,7.0},{{3.2,2.2,-1.4},2.8,3.2},{{.4,3.4,3.6},2.3,6.0}};
 // Material studies are raised above the floor. A low reflection panel reveals
 // polished vertical mineral faces; an overhead beauty key cannot do that.
 if(mode==2)setups={{{-1.8,.2,-3.4},2.0,6.0,.45},{{2.8,2.4,-1.5},2.5,10.0},{{-.5,2.8,2.8},2.0,6.0}};
 if(mode==3)setups={{{-3.0,.8,-1.6},.8,18.0,1.7},{{2.8,2.4,-1.5},2.5,10.0},{{-.5,2.8,2.8},2.0,6.0}};
 for(auto s:setups){
  s.power*=studioScale;
  double height=s.height>0?s.height:s.size;
  V direction=unit(V{0,mode>=2?.96:.5,0}-s.p),u=tangent(direction)*s.size,v=cross(direction,unit(u))*height;
  int mi=int(mats.size());mats.push_back({{},V{s.power,s.power,s.power},0,1,-1});int li=int(lights.size());
  lights.push_back({s.p,u,v,{s.power,s.power,s.power},s.size*height});rectangle(s.p,u,v,mi,li);
 }
 int floor=int(mats.size());mats.push_back({{.08,.085,.095},{},0,.88,-1});rectangle({0,-.015,0},{20,0,0},{0,0,20},floor);
}
double aces(double x){return sat((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14));}
double srgb(double v){return v<=.0031308?12.92*v:1.055*std::pow(v,1/2.4)-.055;}
int main(int argc,char**argv){
 if(argc<9){std::cerr<<"scene output.ppm size spp clay dx dy dz [scale cy]\n";return 2;}
 std::ifstream input(argv[1]);int nm,nt,ntx;input>>nm>>nt>>ntx;
 for(int i=0;i<nm;i++){Material m;input>>m.base.x>>m.base.y>>m.base.z>>m.metal>>m.rough>>m.emission.x>>m.emission.y>>m.emission.z>>m.tex>>m.orm>>m.normal>>m.emissive>>m.ao>>m.normalScale>>m.aoStrength;mats.push_back(m);}
 for(int i=0;i<ntx;i++){Texture t;input>>t.w>>t.h;for(int j=0;j<t.w*t.h;j++){V c;input>>c.x>>c.y>>c.z;t.rgb.push_back(c);}textures.push_back(t);}
 for(int i=0;i<nt;i++){Triangle t;input>>t.material>>t.n.x>>t.n.y>>t.n.z;for(int j=0;j<3;j++)input>>t.p[j].x>>t.p[j].y>>t.p[j].z>>t.uv[j][0]>>t.uv[j][1];tris.push_back(t);}
 if(!input){std::cerr<<"Invalid scene\n";return 3;}studioScale=argc>14?std::stod(argv[14]):1;surfaceEmissionOnly=argc>15&&std::stoi(argv[15]);studio(argc>13?std::stoi(argv[13]):0);order.resize(tris.size());std::iota(order.begin(),order.end(),0);nodes.reserve(tris.size());build(0,int(tris.size()));
 int size=std::stoi(argv[3]),spp=std::stoi(argv[4]);bool clay=std::stoi(argv[5]);
 V forward=unit({std::stod(argv[6]),std::stod(argv[7]),std::stod(argv[8])});V right=unit(cross({0,1,0},forward));if(length(right)<.1)right={1,0,0};V up=cross(forward,right);
 double scale=argc>9?std::stod(argv[9]):1.62,cy=argc>10?std::stod(argv[10]):.48;
 V target{argc>11?std::stod(argv[11]):0,cy,argc>12?std::stod(argv[12]):0};std::vector<unsigned char> pixels(size*size*3);std::atomic<int> row{0};
 auto worker=[&](){for(int y;(y=row.fetch_add(1))<size;){for(int x=0;x<size;x++){
  RNG rng(uint64_t(y*size+x)*0x9e3779b97f4a7c15ULL+1729);V color;
  int grid=int(std::ceil(std::sqrt(spp)));
  for(int s=0;s<spp;s++){
   double jx=(s%grid+rng.next())/grid,jy=(s/grid+rng.next())/grid;
   V o=target+forward*4+right*((x+jx-size*.5)*scale/size)+up*((size*.5-y-jy)*scale/size);
   color=color+trace({o,-forward},rng,clay);
  }color=color/spp;
  for(int a=0;a<3;a++)pixels[(y*size+x)*3+a]=static_cast<unsigned char>(std::round(srgb(aces(color[a]))*255));
 }}};
 std::vector<std::thread> threads;int concurrency=std::min(8u,std::max(1u,std::thread::hardware_concurrency()));
 for(int i=0;i<concurrency;i++)threads.emplace_back(worker);for(auto&t:threads)t.join();
 std::ofstream out(argv[2],std::ios::binary);out<<"P6\n"<<size<<" "<<size<<"\n255\n";out.write(reinterpret_cast<char*>(pixels.data()),pixels.size());
 std::cout<<"rendered "<<size<<" x "<<size<<" spp="<<spp<<" clay="<<clay<<" triangles="<<tris.size()<<"\n";
}
