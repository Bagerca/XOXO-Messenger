import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js';
import { vertexShader, transitions } from './shaders.js';

export class AvatarRenderer {
    constructor(containerId, imageUrl, effectName = 'liquid') {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.width = this.container.offsetWidth || 48; // Фолбэк размер
        this.height = this.container.offsetHeight || 48;
        this.effectName = effectName;
        this.isHovering = false;
        
        // Текущая текстура
        this.currentTexture = null;

        this.init();
        this.loadImage(imageUrl);
        this.setupEvents();
    }

    init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(
            this.width / -2, this.width / 2, this.height / 2, this.height / -2, 1, 1000
        );
        this.camera.position.z = 1;

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        this.container.innerHTML = ''; 
        this.container.appendChild(this.renderer.domElement);

        this.dispTexture = this.createNoiseTexture();
    }

    createNoiseTexture() {
        const size = 128;
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size * 4; i ++) {
            data[i] = Math.random() * 255;
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.needsUpdate = true;
        return texture;
    }

    loadImage(url) {
        new THREE.TextureLoader().load(url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            this.currentTexture = texture;
            this.createMesh(texture);
        });
    }

    createMesh(texture) {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if(this.geometry) this.geometry.dispose();
            if(this.material) this.material.dispose();
        }

        const transition = transitions[this.effectName] || transitions.liquid;
        
        this.geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
        
        this.uniforms = {
            texture1: { value: texture },
            texture2: { value: texture },
            disp: { value: this.dispTexture },
            dispFactor: { value: 0.0 },
            intensity: { value: transition.uniforms.intensity }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: transition.shader,
            transparent: true
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
        
        this.render();
    }

    setupEvents() {
        this.container.addEventListener('mouseenter', () => {
            this.isHovering = true;
            this.animateTransition(1);
        });

        this.container.addEventListener('mouseleave', () => {
            this.isHovering = false;
            this.animateTransition(0);
        });
    }

    animateTransition(targetValue) {
        if (!this.material) return;
        const transition = transitions[this.effectName] || transitions.liquid;
        
        gsap.to(this.uniforms.dispFactor, {
            value: targetValue,
            duration: transition.config.duration,
            ease: transition.config.ease,
            onUpdate: () => this.render()
        });
    }

    setEffect(newEffectName) {
        if (transitions[newEffectName]) {
            this.effectName = newEffectName;
            // Пересоздаем меш с новым шейдером
            if (this.currentTexture) {
                this.createMesh(this.currentTexture);
            }
        }
    }

    updateImage(url) {
        new THREE.TextureLoader().load(url, (tex) => {
            this.currentTexture = tex;
            if(this.uniforms) {
                this.uniforms.texture1.value = tex;
                this.uniforms.texture2.value = tex;
                this.render();
            } else {
                this.createMesh(tex);
            }
        });
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
