/** Heavy post processing is opt-in only after actual GPU timings meet this budget. */
export interface PassMeasurement { readonly gpuMs: readonly number[]; readonly frameMs: readonly number[] }
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*fraction)-1)] ?? null;
}
export function bloomWithinBudget(base: PassMeasurement, bloom: PassMeasurement): boolean {
  if (base.gpuMs.length < 60 || bloom.gpuMs.length < 60 || bloom.frameMs.length < 60) return false;
  if ([...base.gpuMs, ...base.frameMs, ...bloom.gpuMs, ...bloom.frameMs].some(v => !Number.isFinite(v) || v <= 0)) return false;
  const before = percentile(base.gpuMs,.95)!, after = percentile(bloom.gpuMs,.95)!, frame = percentile(bloom.frameMs,.95)!;
  return Number.isFinite(before) && Number.isFinite(after) && after-before <= 2 && after <= 18 && frame <= 25;
}

/** Non-blocking WebGL timer queries. Never substitute render submission CPU time for GPU time. */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly waiting: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  readonly samples: number[] = [];
  constructor(gl: WebGL2RenderingContext) { this.gl=gl; this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'); }
  get supported(): boolean { return this.ext !== null; }
  begin(): void {
    if (!this.ext || this.active || this.waiting.length >= 8) return;
    this.active=this.gl.createQuery();if(this.active)this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active);
  }
  end(): void {
    if(!this.ext || !this.active)return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.waiting.push(this.active);this.active=null;
  }
  poll(): void {
    if(!this.ext)return;
    if(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)){this.clear();return;}
    while(this.waiting[0] && this.gl.getQueryParameter(this.waiting[0],this.gl.QUERY_RESULT_AVAILABLE)) {
      const query=this.waiting.shift()!;this.samples.push(this.gl.getQueryParameter(query,this.gl.QUERY_RESULT)/1e6);this.gl.deleteQuery(query);
      if(this.samples.length>600)this.samples.shift();
    }
  }
  clear(): void { for(const q of this.waiting)this.gl.deleteQuery(q);this.waiting.length=0;this.samples.length=0; }
  dispose(): void { if(this.active&&this.ext){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.gl.deleteQuery(this.active);}this.active=null;this.clear(); }
}
