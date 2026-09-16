// Minimal column-major 4x4 / 3x3 matrix helpers (gl-matrix subset).

export const create = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

export function identity(o) {
  o[0]=1;o[1]=0;o[2]=0;o[3]=0; o[4]=0;o[5]=1;o[6]=0;o[7]=0;
  o[8]=0;o[9]=0;o[10]=1;o[11]=0; o[12]=0;o[13]=0;o[14]=0;o[15]=1;
  return o;
}

export function multiply(o, a, b) {
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
        a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  for (let i = 0; i < 4; i++) {
    const b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
    o[i*4]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    o[i*4+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    o[i*4+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    o[i*4+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  }
  return o;
}

export function translate(o, a, v) {
  const [x,y,z] = v;
  if (o !== a) o.set(a);
  o[12] = a[0]*x + a[4]*y + a[8]*z + a[12];
  o[13] = a[1]*x + a[5]*y + a[9]*z + a[13];
  o[14] = a[2]*x + a[6]*y + a[10]*z + a[14];
  o[15] = a[3]*x + a[7]*y + a[11]*z + a[15];
  return o;
}

export function scale(o, a, v) {
  const [x,y,z] = v;
  for (let i = 0; i < 4; i++) { o[i]=a[i]*x; o[4+i]=a[4+i]*y; o[8+i]=a[8+i]*z; o[12+i]=a[12+i]; }
  return o;
}

function rotateAxis(o, a, rad, axis) {
  const s = Math.sin(rad), c = Math.cos(rad);
  // columns to mix: (1,2) for X, (2,0) for Y, (0,1) for Z
  const [p, q] = axis === 0 ? [1,2] : axis === 1 ? [2,0] : [0,1];
  const P = [a[p*4],a[p*4+1],a[p*4+2],a[p*4+3]];
  const Q = [a[q*4],a[q*4+1],a[q*4+2],a[q*4+3]];
  if (o !== a) o.set(a);
  for (let i = 0; i < 4; i++) {
    o[p*4+i] = P[i]*c + Q[i]*s;
    o[q*4+i] = Q[i]*c - P[i]*s;
  }
  return o;
}

export const rotateX = (o,a,r) => rotateAxis(o,a,r,0);
export const rotateY = (o,a,r) => rotateAxis(o,a,r,1);
export const rotateZ = (o,a,r) => rotateAxis(o,a,r,2);

export function fromTranslation(o, v) { identity(o); o[12]=v[0]; o[13]=v[1]; o[14]=v[2]; return o; }

export function invert(o, a) {
  const [a00,a01,a02,a03,a10,a11,a12,a13,a20,a21,a22,a23,a30,a31,a32,a33] = a;
  const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
        b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
        b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
        b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
  if (!det) return null;
  det = 1.0 / det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}

export function perspective(o, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect; o[5] = f; o[11] = -1;
  o[10] = (far + near) / (near - far);
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function lookAt(o, eye, center, up) {
  let z0=eye[0]-center[0], z1=eye[1]-center[1], z2=eye[2]-center[2];
  let len = 1 / Math.hypot(z0, z1, z2);
  z0*=len; z1*=len; z2*=len;
  let x0 = up[1]*z2 - up[2]*z1, x1 = up[2]*z0 - up[0]*z2, x2 = up[0]*z1 - up[1]*z0;
  len = Math.hypot(x0, x1, x2);
  if (!len) { x0 = x1 = x2 = 0; } else { len = 1/len; x0*=len; x1*=len; x2*=len; }
  const y0 = z1*x2 - z2*x1, y1 = z2*x0 - z0*x2, y2 = z0*x1 - z1*x0;
  o[0]=x0; o[1]=y0; o[2]=z0; o[3]=0;
  o[4]=x1; o[5]=y1; o[6]=z1; o[7]=0;
  o[8]=x2; o[9]=y2; o[10]=z2; o[11]=0;
  o[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);
  o[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);
  o[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);
  o[15]=1;
  return o;
}

// Upper-left 3x3 inverse-transpose, as a mat3 (9 floats).
export function normalFromMat4(o, a) {
  const inv = invert(create(), a);
  if (!inv) return null;
  o[0]=inv[0]; o[1]=inv[4]; o[2]=inv[8];
  o[3]=inv[1]; o[4]=inv[5]; o[5]=inv[9];
  o[6]=inv[2]; o[7]=inv[6]; o[8]=inv[10];
  return o;
}

// The notebook's `createTransform`: maps attractor coordinates into a unit-ish
// box centred at y = 0.5, sitting on the floor plane at y = -0.5.
export function viewTransform({ center = [0,0,0], size = [1,1,1], rotation = [0,0,0] } = {}) {
  const m = create();
  translate(m, m, center);
  scale(m, m, size);
  rotateX(m, m, rotation[0]);
  rotateY(m, m, rotation[1]);
  rotateZ(m, m, rotation[2]);
  invert(m, m);
  return multiply(m, fromTranslation(create(), [0, 0.5, 0]), m);
}
