import bpy
s=bpy.data.scenes.get('MINER_CITADEL_DISTRICTS')
RESULT={c.name:[o.name for o in c.objects][:8] for c in s.collection.children} if s else {'error':'scene not loaded'}
