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
  
  // Fractal brownian motion for richer patterns
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for(int i = 0; i < 4; i++) {
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }
  
  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = vUv;
    vec2 centeredUv = uv - center;
    float dist = length(centeredUv);
    float angle = atan(centeredUv.y, centeredUv.x);
    
    // Hard circle mask with soft edge
    float circle = 1.0 - smoothstep(0.44, 0.48, dist);
    
    if (circle < 0.01) {
      discard;
    }
    
    // Time and volume - voice reactivity
    float time = uTime * 0.2;
    float vol = uVolume * 3.0 + 0.15; // Always some base movement
    
    // Create large flowing color regions using polar coordinates
    float polarNoise1 = fbm(vec2(angle * 0.5 + time * 0.3, dist * 2.0 + time * 0.2));
    float polarNoise2 = fbm(vec2(angle * 0.7 - time * 0.25, dist * 1.5 - time * 0.15));
    float polarNoise3 = fbm(vec2(angle * 0.4 + time * 0.4, dist * 2.5 + sin(time) * 0.3));
    
    // Large flowing bands based on angle and radius
    float band1 = sin(angle * 2.0 + time * 0.5 + polarNoise1 * 3.0) * 0.5 + 0.5;
    float band2 = sin(angle * 1.5 - time * 0.4 + polarNoise2 * 2.5) * 0.5 + 0.5;
    float band3 = cos(angle * 2.5 + time * 0.6 + polarNoise3 * 2.0) * 0.5 + 0.5;
    
    // Voice-reactive wave distortion
    float voiceWave = sin(dist * 8.0 - time * 4.0 * vol) * vol * 0.3;
    float voicePulse = sin(time * 3.0 + angle * 3.0) * vol * 0.4;
    
    // Blend colors in large, flowing regions
    vec3 color = uColor1;
    
    // Large color band 1 - sweeping across
    float blend1 = smoothstep(0.3, 0.7, band1 + voiceWave);
    color = mix(color, uColor2, blend1 * 0.85);
    
    // Large color band 2 - counter-rotating
    float blend2 = smoothstep(0.35, 0.75, band2 + voicePulse);
    color = mix(color, uColor3, blend2 * 0.75);
    
    // Accent color in specific regions
    float blend3 = smoothstep(0.4, 0.8, band3 * (1.0 + vol * 0.5));
    color = mix(color, uColor4, blend3 * 0.6);
    
    // Radial gradient - brighter center, darker edges
    float radialGradient = 1.0 - smoothstep(0.0, 0.45, dist);
    color += radialGradient * 0.3 * (1.0 + vol * 0.5);
    
    // Inner glow that pulses with voice
    float innerGlow = 1.0 - smoothstep(0.0, 0.25, dist);
    vec3 glowColor = mix(uColor2, uColor3, sin(time * 2.0) * 0.5 + 0.5);
    color += innerGlow * glowColor * 0.4 * (1.0 + vol);
    
    // Voice-reactive brightness waves
    float brightWave = sin(dist * 6.0 - time * 5.0) * vol * 0.15;
    color += brightWave;
    
    // Edge highlight with accent color
    float edgeHighlight = smoothstep(0.35, 0.46, dist) * (1.0 - smoothstep(0.46, 0.48, dist));
    color = mix(color, uColor4 * 1.3, edgeHighlight * 0.5);
    
    // Saturation and vibrancy boost
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, 1.3); // Boost saturation
    color *= 1.2; // Overall brightness
    
    // Clamp to prevent over-bright
    color = clamp(color, 0.0, 1.2);
    
    gl_FragColor = vec4(color, circle);
  }
`;
