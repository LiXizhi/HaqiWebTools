import * as THREE from 'https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js';

// A continuous pear surface. All face markings use this same analytic surface.
const centerY = 1.06;
function widthAt(y) {
  const v = Math.max(-1, Math.min(1, y - centerY));
  return Math.sqrt(Math.max(0, 1 - v * v)) * (1 - .13 * v);
}
function surface(x, y, offset = .008) {
  const w = widthAt(y);
  return new THREE.Vector3(x, y, .78 * Math.sqrt(Math.max(0, w * w - (x / .96) ** 2)) + offset);
}
function surfaceNormal(x, y) {
  const dx = surface(x + .001, y).sub(surface(x - .001, y));
  const dy = surface(x, y + .001).sub(surface(x, y - .001));
  return dx.cross(dy).normalize();
}

export function createLavenderPetModel() {
  const root = new THREE.Group();
  root.name = 'lavender-pet';
  const parts = [];
  const labels = new Map();
  const skin = new THREE.MeshPhysicalMaterial({color: '#b8a0de', roughness: .52, metalness: 0, clearcoat: .12, clearcoatRoughness: .5});
  const pale = new THREE.MeshStandardMaterial({color: '#eee5fb', roughness: .65});
  const plum = new THREE.MeshPhysicalMaterial({color: '#32103e', roughness: .19, clearcoat: .6});
  const iris = new THREE.MeshStandardMaterial({color: '#60236f', roughness: .4});
  const white = new THREE.MeshBasicMaterial({color: '#fff9ff'});
  const mouthMaterial = new THREE.MeshStandardMaterial({color: '#45204e', roughness: .7});

  function part(id, label, anchor = new THREE.Vector3()) {
    const group = new THREE.Group();
    group.name = id;
    group.position.copy(anchor);
    group.userData.home = anchor.clone();
    group.userData.partId = id;
    root.add(group);
    parts.push(group);
    labels.set(id, label);
    return group;
  }
  function mesh(parent, geometry, material, name) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const bodyPart = part('body', '身体 · 连续的梨形曲面');
  const bodyGeometry = new THREE.SphereGeometry(1, 80, 56);
  const positions = bodyGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    positions.setXYZ(i, positions.getX(i) * .96 * (1 - .13 * y), y + centerY, positions.getZ(i) * .78 * (1 - .13 * y));
  }
  bodyGeometry.computeVertexNormals();
  mesh(bodyPart, bodyGeometry, skin, 'body-surface');

  // Radial triangulation follows the body: no flat decal floating in front of it.
  function patch(parent, name, cx, cy, rx, ry, angle = 0) {
    const points = [], indices = [];
    const rings = 12, segments = 64;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let ring = 0; ring <= rings; ring++) {
      for (let j = 0; j <= segments; j++) {
        const a = j / segments * Math.PI * 2;
        const u = Math.cos(a) * rx * ring / rings, v = Math.sin(a) * ry * ring / rings;
        const point = surface(cx + u * c - v * s, cy + u * s + v * c, .012).sub(parent.position);
        points.push(...point.toArray());
        if (ring < rings && j < segments) {
          const a0 = ring * (segments + 1) + j, b = a0 + segments + 1;
          indices.push(a0, b, b + 1, a0, b + 1, a0 + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mark = mesh(parent, geometry, pale, name);
    mark.castShadow = false;
    mark.userData.explodeWithParent = true;
  }
  const belly = part('belly', '肚皮 · 奶白色的圆弧', surface(0, .35));
  patch(belly, 'belly-patch', 0, .35, .43, .25);
  for (const sign of [-1, 1]) {
    const id = sign < 0 ? 'left' : 'right';
    const cheek = part(`cheek-${id}`, '脸颊 · 浅紫色的小斑点', surface(sign * .68, .78));
    patch(cheek, `cheek-${id}-upper`, sign * .73, .85, .075, .105, -sign * .4);
    patch(cheek, `cheek-${id}-lower`, sign * .65, .59, .053, .056);
    const eye = part(`eye-${id}`, '眼睛 · 深紫瞳色与双重高光', surface(sign * .405, 1.15, .012));
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfaceNormal(sign * .405, 1.15));
    const eyeball = mesh(eye, new THREE.SphereGeometry(1, 40, 32), plum, `eye-${id}-shell`);
    eyeball.scale.set(.169, .222, .071);
    const color = mesh(eye, new THREE.SphereGeometry(1, 32, 24), iris, `eye-${id}-iris`);
    color.scale.set(.123, .082, .019);
    color.position.set(.006, -.112, .05);
    const pupil = mesh(eye, new THREE.SphereGeometry(1, 32, 24), plum, `eye-${id}-pupil`);
    pupil.scale.set(.136, .169, .035);
    pupil.position.set(0, .023, .055);
    for (const [index, x, y, radius] of [[0, -.049, .101, .047], [1, .063, -.056, .021]]) {
      const glint = mesh(eye, new THREE.SphereGeometry(1, 20, 16), white, `eye-${id}-glint-${index}`);
      glint.scale.set(radius, radius * 1.18, .009);
      glint.position.set(x, y, .09);
      glint.castShadow = false;
    }
  }

  const mouth = part('mouth', '微笑 · 小小的上扬嘴角', surface(0, .9));
  const smilePoints = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    smilePoints.push(surface(-.128 + .256 * t, .905 - .07 * Math.sin(Math.PI * t), .021).sub(mouth.position));
  }
  mesh(mouth, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePoints), 32, .014, 8, false), mouthMaterial, 'smile-line');

  // Each antenna is one closed variable-radius sweep, embedded in the crown.
  function antenna(id, label, controls, thickness) {
    const anchor = new THREE.Vector3(...controls[0]);
    const group = part(id, label, anchor);
    const curve = new THREE.CatmullRomCurve3(controls.map(point => new THREE.Vector3(...point).sub(anchor)));
    const steps = 40, radial = 16;
    const frames = curve.computeFrenetFrames(steps, false);
    const vertices = [], indices = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPointAt(t);
      const radius = thickness * (0.55 + .65 * Math.exp(-(((t - .73) / .22) ** 2))) * Math.pow(Math.max(0, 1 - t ** 9), .55);
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2;
        const point = center.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius * .65);
        vertices.push(...point.toArray());
        if (i < steps && j < radial) {
          const p = i * (radial + 1) + j, q = p + radial + 1;
          indices.push(p, p + 1, q, p + 1, q + 1, q);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(group, geometry, skin, `${id}-surface`);
  }
  antenna('antenna-left', '左触角 · 向外舒展的小叶片', [[-.3, 1.96, 0], [-.32, 2.12, 0], [-.49, 2.27, -.01], [-.57, 2.29, -.02]], .112);
  antenna('antenna-center', '中央触角 · 高高探出的小芽', [[.055, 2.015, 0], [.1, 2.25, -.015], [.23, 2.5, -.025], [.23, 2.57, -.025]], .125);
  antenna('antenna-right', '右触角 · 弯弯的小叶片', [[.4, 1.94, 0], [.47, 2.13, .005], [.63, 2.16, .01], [.74, 2.09, .015]], .12);

  root.userData.sculptRuntime = {parts, labels, setExplode(value) {
    const center = new THREE.Vector3(0, 1.1, 0);
    for (const group of parts) {
      group.position.copy(group.userData.home);
      if (group !== bodyPart) group.position.addScaledVector(group.userData.home.clone().sub(center), value * .8);
    }
  }};
  return root;
}
