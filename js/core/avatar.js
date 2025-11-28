import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js';
import { vertexShader, transitions } from './shaders.js';

export class AvatarRenderer {
    constructor(containerId, imageUrl) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        
        this.init();
        this.loadImage(imageUrl);
        this.addEvents();
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

        // Создаем шум для Liquid эффекта
        const size = 128;
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size * 4; i++) data[i] = Math.random() * 255;
        this.dispTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        this.dispTexture.needsUpdate = true;
    }

    loadImage(url) {
        new THREE.TextureLoader().load(url, (tex) => {
            tex.minFilter = THREE.LinearFilter;
            this.createMesh(tex);
        });
    }

    createMesh(texture) {
        if (this.mesh) this.scene.remove(this.mesh);
        
        const transition = transitions.liquid; // Пока только Liquid для простоты
        
        this.uniforms = {
            texture1: { value: texture },
            texture2: { value: texture },
            disp: { value: this.dispTexture },
            dispFactor: { value: 0.0 },
            intensity: { value: 0.3 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: transition.shader,
            transparent: true
        });

        this.geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
        this.render();
    }

    addEvents() {
        this.container.addEventListener('mouseenter', () => {
            gsap.to(this.uniforms.dispFactor, { value: 1, duration: 1, onUpdate: () => this.render() });
        });
        this.container.addEventListener('mouseleave', () => {
            gsap.to(this.uniforms.dispFactor, { value: 0, duration: 1, onUpdate: () => this.render() });
        });
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
