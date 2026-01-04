export const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform float uVolume;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  
  // Simplex noise functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = vUv;
    float dist = length(uv - center);
    
    // Hard circle mask
    float circle = 1.0 - smoothstep(0.48, 0.5, dist);
    
    if (circle < 0.01) {
      discard;
    }
    
    // Time and volume factors
    float time = uTime * 0.15;
    float volumeEffect = uVolume * 0.8;
    
    // Create flowing noise layers with different speeds
    float noise1 = snoise(uv * 2.0 + vec2(time * 0.3, time * 0.2)) * 0.5 + 0.5;
    float noise2 = snoise(uv * 3.0 - vec2(time * 0.25, time * 0.35) + 10.0) * 0.5 + 0.5;
    float noise3 = snoise(uv * 1.5 + vec2(time * 0.4, -time * 0.15) + 20.0) * 0.5 + 0.5;
    float noise4 = snoise(uv * 2.5 - vec2(-time * 0.2, time * 0.3) + 30.0) * 0.5 + 0.5;
    
    // Volume-reactive swirl
    float swirl = snoise(uv * 4.0 + vec2(sin(time * 2.0) * volumeEffect, cos(time * 2.0) * volumeEffect)) * 0.5 + 0.5;
    
    // Blend colors based on noise
    vec3 color = uColor1;
    color = mix(color, uColor2, noise1 * 0.7);
    color = mix(color, uColor3, noise2 * 0.5);
    color = mix(color, uColor4, noise3 * 0.4);
    
    // Add volume-reactive brightness pulse
    float pulse = swirl * volumeEffect * 0.6;
    color += pulse * 0.3;
    
    // Subtle edge glow
    float edgeGlow = smoothstep(0.3, 0.5, dist) * 0.15;
    color = mix(color, uColor4, edgeGlow);
    
    // Inner depth effect
    float innerDepth = 1.0 - smoothstep(0.0, 0.4, dist);
    color = mix(color, uColor1 * 1.2, innerDepth * 0.2);
    
    // Soft anti-aliased edge
    float alpha = circle * 0.95;
    
    gl_FragColor = vec4(color, alpha);
  }
`;
