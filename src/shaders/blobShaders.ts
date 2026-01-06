export const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform float uVolume;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  
  varying vec2 vUv;
  
  // Smooth noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  float smoothNoise(vec2 p) {
    float value = 0.0;
    value += noise(p) * 0.5;
    value += noise(p * 2.0) * 0.25;
    value += noise(p * 4.0) * 0.125;
    return value;
  }
  
  void main() {
    vec2 center = vec2(0.5);
    vec2 uv = vUv;
    float dist = length(uv - center);
    
    // Hard circle mask
    float circle = 1.0 - smoothstep(0.42, 0.44, dist);
    if (circle < 0.01) discard;
    
    // Slow time for smooth movement
    float time = uTime * 0.15;
    float vol = uVolume * 1.5 + 0.1;
    
    // Create 3 large, slow-moving blobs
    float angle = atan(uv.y - 0.5, uv.x - 0.5);
    
    // Blob 1 - large sweeping region
    float blob1 = smoothNoise(vec2(
      angle * 0.3 + time * 0.5,
      dist * 1.5 + time * 0.2
    ));
    blob1 = smoothstep(0.3, 0.6, blob1);
    
    // Blob 2 - counter-rotating
    float blob2 = smoothNoise(vec2(
      angle * 0.4 - time * 0.3,
      dist * 2.0 - time * 0.15
    ));
    blob2 = smoothstep(0.35, 0.65, blob2);
    
    // Blob 3 - radial pulse with voice
    float blob3 = smoothNoise(vec2(
      dist * 3.0 + sin(time) * 0.5,
      angle * 0.2 + time * 0.4
    ));
    blob3 = smoothstep(0.4, 0.7, blob3) * (0.5 + vol * 0.5);
    
    // Start with base color
    vec3 color = uColor1;
    
    // Layer colors with smooth blending
    color = mix(color, uColor2, blob1 * 0.7);
    color = mix(color, uColor3, blob2 * 0.6);
    color = mix(color, uColor1 * 1.3, blob3 * 0.4);
    
    // Soft center glow
    float centerGlow = 1.0 - smoothstep(0.0, 0.35, dist);
    color += centerGlow * 0.2 * (1.0 + vol * 0.3);
    
    // Subtle voice pulse
    float pulse = sin(dist * 4.0 - time * 3.0 * vol) * vol * 0.08;
    color += pulse;
    
    // Soft edge
    float edge = smoothstep(0.35, 0.43, dist);
    color *= (1.0 - edge * 0.3);
    
    gl_FragColor = vec4(color, circle);
  }
`;
