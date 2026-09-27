// Preview-only texture substitution. Pose geometry always comes from the base art.
export function previewBodyManifest(base,variant){
 const manifest=structuredClone(base);
 if(!variant)return manifest;
 const body=manifest.bodies[variant.baseBody];
 if(!body?.walk||variant.width!==body.width||variant.height!==body.height)throw new Error('试装图集尺寸与原图不一致');
 const texture=Object.fromEntries(['local','cdn','width','height','bytes','sha256','encoding'].map(key=>[key,variant[key]]));
 Object.assign(body,texture);Object.assign(body.walk,texture);
 return manifest;
}
