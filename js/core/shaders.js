export const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const effects = {
    // 1. ЖИДКОСТЬ (Стандарт)
    liquid: {
        uniforms: { intensity: 0.3 },
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform sampler2D disp;
            uniform float dispFactor;
            uniform float intensity;
            void main() {
                vec2 uv = vUv;
                vec4 disp = texture2D(disp, uv);
                vec2 distortedPosition = vec2(uv.x + dispFactor * (disp.r * intensity), uv.y);
                gl_FragColor = texture2D(texture1, distortedPosition);
            }
        `
    },
    // 2. ГЛИТЧ (Киберпанк)
    glitch: {
        uniforms: { intensity: 0.5, time: 0.0 },
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform float dispFactor;
            uniform float intensity;
            uniform float time;
            
            float rand(vec2 co){
                return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
                vec2 uv = vUv;
                if(dispFactor > 0.1) {
                    float split = intensity * 0.1 * dispFactor;
                    float noise = rand(vec2(uv.y, time)) * split;
                    gl_FragColor = vec4(
                        texture2D(texture1, uv + vec2(noise, 0.0)).r,
                        texture2D(texture1, uv - vec2(noise, 0.0)).g,
                        texture2D(texture1, uv).b,
                        1.0
                    );
                } else {
                    gl_FragColor = texture2D(texture1, uv);
                }
            }
        `
    },
    // 3. ПИКСЕЛИЗАЦИЯ (Ретро)
    pixel: {
        uniforms: { intensity: 50.0 }, // Чем меньше, тем крупнее пиксели
        shader: `
            varying vec2 vUv;
            uniform sampler2D texture1;
            uniform float dispFactor;
            void main() {
                vec2 uv = vUv;
                if (dispFactor > 0.1) {
                    float pixels = 200.0 - (150.0 * dispFactor);
                    uv = floor(uv * pixels) / pixels;
                }
                gl_FragColor = texture2D(texture1, uv);
            }
        `
    }
};
