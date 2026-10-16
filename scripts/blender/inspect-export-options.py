properties=bpy.ops.export_scene.gltf.get_rna_type().properties
RESULT={key: ([item.identifier for item in properties[key].enum_items] if properties[key].type=='ENUM' else properties[key].type) for key in ['use_active_scene','export_animation_mode','export_nla_strips'] if key in properties}
