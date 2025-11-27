// --- js/shaders.js ---

export const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const transitions = {
    // 1. LIQUID (ЖИДКОСТЬ)
    liquid: {
        uniforms: { intensity: 0.3 },
        config: { duration: 0.9, ease: "power2.inOut" },
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform sampler2D texture2;
            uniform sampler2D disp;
            uniform float dispFactor;
            uniform float intensity;
            void main() {
                vec2 uv = vUv;
                vec4 disp = texture2D(disp, uv);
                vec2 distortedPosition1 = vec2(uv.x + dispFactor * (disp.r * intensity), uv.y);
                vec2 distortedPosition2 = vec2(uv.x - (1.0 - dispFactor) * (disp.r * intensity), uv.y);
                vec4 _texture1 = texture2D(texture1, distortedPosition1);
                vec4 _texture2 = texture2D(texture2, distortedPosition2);
                gl_FragColor = mix(_texture1, _texture2, dispFactor);
            }
        `
    },

    // 2. GLITCH (СБОЙ)
    glitch: {
        uniforms: { intensity: 0.1 },
        config: { duration: 0.4, ease: "steps(5)" }, 
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform sampler2D texture2;
            uniform float dispFactor;
            uniform float intensity;
            void main() {
                vec2 uv = vUv;
                float split = (sin(dispFactor * 20.0) * intensity); 
                vec4 t1;
                t1.r = texture2D(texture1, vec2(uv.x - split, uv.y)).r;
                t1.g = texture2D(texture1, vec2(uv.x, uv.y)).g;
                t1.b = texture2D(texture1, vec2(uv.x + split, uv.y)).b;
                t1.a = 1.0;
                vec4 t2;
                t2.r = texture2D(texture2, vec2(uv.x - split, uv.y)).r;
                t2.g = texture2D(texture2, vec2(uv.x, uv.y)).g;
                t2.b = texture2D(texture2, vec2(uv.x + split, uv.y)).b;
                t2.a = 1.0;
                gl_FragColor = mix(t1, t2, step(0.5, dispFactor));
            }
        `
    },

    // 3. RADIO (ПОМЕХИ)
    radio: {
        uniforms: { intensity: 0.2 }, 
        config: { duration: 1.2, ease: "power2.inOut" },
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform sampler2D texture2;
            uniform float dispFactor;
            uniform float intensity;
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            void main() {
                vec2 uv = vUv;
                float wave = sin(uv.y * 30.0 + dispFactor * 10.0) * sin(dispFactor * 3.14) * intensity;
                vec2 dUV = vec2(uv.x + wave, uv.y);
                vec4 t1 = texture2D(texture1, dUV);
                vec4 t2 = texture2D(texture2, dUV);
                float noise = random(uv * (dispFactor * 50.0)) * 0.3 * sin(dispFactor * 3.14);
                vec4 color = mix(t1, t2, step(0.5, dispFactor));
                color.rgb += noise;
                gl_FragColor = color;
            }
        `
    },

    // 4. CHAINSAW (ПИЛА + КРОВЬ)
    chainsaw: {
        uniforms: { intensity: 0.5 },
        config: { duration: 0.6, ease: "bounce.inOut" },
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform sampler2D texture2;
            uniform float dispFactor;
            uniform float intensity;
            float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
            void main() {
                vec2 uv = vUv;
                float teeth = floor(uv.y * 20.0);
                float dir = mod(teeth, 2.0) * 2.0 - 1.0;
                float shift = dispFactor * intensity * dir * sin(dispFactor * 3.14);
                vec2 dUV = vec2(uv.x + shift, uv.y);
                vec4 t1 = texture2D(texture1, dUV);
                vec4 t2 = texture2D(texture2, dUV);
                float blood = sin(dispFactor * 3.14);
                vec4 color = mix(t1, t2, step(0.5, dispFactor));
                color.r += blood * 0.4;
                gl_FragColor = color;
            }
        `
    }
};
