import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js';
import { vertexShader, effects } from './shaders.js';

export class AvatarRenderer {
    constructor(containerId, imageUrl, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        
        // Настройки по умолчанию
        this.options = Object.assign({
            effect: 'liquid', // liquid, glitch, pixel
            intensity: 0.5
        }, options);

        this.init();
        this.loadImage(imageUrl);
        this.addEvents();
        this.animate();
    }

    init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(
            this.width / -2, this.width / 2, this.height / 2, this.height / -2, 1, 1000
        );
        this.camera.position.z = 1;

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(this.width, this.height);
        this.container.appendChild(this.renderer.domElement);

        // Текстура шума для Liquid
        const size = 128;
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size * 4; i++) data[i] = Math.random() * 255;
        this.dispTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        this.dispTexture.needsUpdate = true;
        this.clock = new THREE.Clock();
    }

    // Смена картинки
    updateImage(url) {
        new THREE.TextureLoader().load(url, (tex) => {
            tex.minFilter = THREE.LinearFilter;
            this.currentTexture = tex;
            this.createMesh();
        });
    }

    // Смена настроек (шейдер, интенсивность)
    updateSettings(newOptions) {
        this.options = Object.assign(this.options, newOptions);
        if (this.currentTexture) this.createMesh();
    }

    loadImage(url) { this.updateImage(url); }

    createMesh() {
        if (this.mesh) this.scene.remove(this.mesh);
        
        const effectData = effects[this.options.effect] || effects.liquid;
        
        this.uniforms = {
            texture1: { value: this.currentTexture },
            disp: { value: this.dispTexture },
            dispFactor: { value: 0.0 },
            intensity: { value: this.options.intensity },
            time: { value: 0.0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: effectData.shader,
            transparent: true
        });

        this.geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }

    addEvents() {
        this.container.addEventListener('mouseenter', () => {
            gsap.to(this.uniforms.dispFactor, { value: 1, duration: 0.8, ease: "power2.out" });
        });
        this.container.addEventListener('mouseleave', () => {
            gsap.to(this.uniforms.dispFactor, { value: 0, duration: 0.8, ease: "power2.inOut" });
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.uniforms && this.uniforms.time) {
            this.uniforms.time.value = this.clock.getElapsedTime();
        }
        this.renderer.render(this.scene, this.camera);
    }
}
