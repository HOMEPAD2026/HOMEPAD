import"./c-VHNSBD2M.js";import{Color as C,Matrix4 as U,Mesh as V,Plane as k,ShaderMaterial as B,UniformsUtils as H,Vector3 as f,Vector4 as S,WebGLRenderTarget as I,HalfFloatType as q}from"/vendor/three/three-0.186.1.module.min.js";var y=class _ extends V{constructor(P,o={}){super(P),this.isReflector=!0,this.type="Reflector",this.forceUpdate=!1,this._reflectionCameras=new WeakMap;let s=this,F=o.color!==void 0?new C(o.color):new C(8355711),O=o.textureWidth||512,T=o.textureHeight||512,R=o.clipBias||0,m=o.shader||_.ReflectorShader,j=o.multisample!==void 0?o.multisample:4,c=new k,i=new f,d=new f,w=new f,p=new U,v=new f(0,0,-1),r=new S,x=new f,g=new f,n=new S,h=new U,b=new I(O,T,{samples:j,type:q}),M=new B({name:m.name!==void 0?m.name:"unspecified",uniforms:H.clone(m.uniforms),fragmentShader:m.fragmentShader,vertexShader:m.vertexShader});M.uniforms.tDiffuse.value=b.texture,M.uniforms.color.value=F,M.uniforms.textureMatrix.value=h,this.material=M,this.onBeforeRender=function(e,u,l){let a=this.getReflectionCamera(l);if(d.setFromMatrixPosition(s.matrixWorld),w.setFromMatrixPosition(l.matrixWorld),p.extractRotation(s.matrixWorld),i.set(0,0,1),i.applyMatrix4(p),x.subVectors(d,w),x.dot(i)>0===!0&&this.forceUpdate===!1)return;x.reflect(i).negate(),x.add(d),p.extractRotation(l.matrixWorld),v.set(0,0,-1),v.applyMatrix4(p),v.add(w),g.subVectors(d,v),g.reflect(i).negate(),g.add(d),a.position.copy(x),a.up.set(0,1,0),a.up.applyMatrix4(p),a.up.reflect(i),a.lookAt(g),a.far=l.far,a.updateMatrixWorld(),a.projectionMatrix.copy(l.projectionMatrix),h.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),h.multiply(a.projectionMatrix),h.multiply(a.matrixWorldInverse),h.multiply(s.matrixWorld),c.setFromNormalAndCoplanarPoint(i,d),c.applyMatrix4(a.matrixWorldInverse),r.set(c.normal.x,c.normal.y,c.normal.z,c.constant);let t=a.projectionMatrix;a.isOrthographicCamera?(n.x=(Math.sign(r.x)+t.elements[8])/t.elements[0],n.y=(Math.sign(r.y)+t.elements[9])/t.elements[5],n.z=-l.far,n.w=1):(n.x=(Math.sign(r.x)+t.elements[8])/t.elements[0],n.y=(Math.sign(r.y)+t.elements[9])/t.elements[5],n.z=-1,n.w=(1+t.elements[10])/t.elements[14]),r.multiplyScalar(2/r.dot(n)),t.elements[2]=r.x,t.elements[6]=r.y,a.isOrthographicCamera?(t.elements[10]=r.z-R,t.elements[14]=r.w-1):(t.elements[10]=r.z+1-R,t.elements[14]=r.w),s.visible=!1;let A=e.getRenderTarget(),D=e.xr.enabled,z=e.shadowMap.autoUpdate;e.xr.enabled=!1,e.shadowMap.autoUpdate=!1,e.setRenderTarget(b),e.state.buffers.depth.setMask(!0),e.autoClear===!1&&e.clear(),e.render(u,a),e.xr.enabled=D,e.shadowMap.autoUpdate=z,e.setRenderTarget(A);let W=l.viewport;W!==void 0&&e.state.viewport(W),s.visible=!0,this.forceUpdate=!1},this.getRenderTarget=function(){return b},this.dispose=function(){b.dispose(),s.material.dispose()},this.getReflectionCamera=function(e){let u=this._reflectionCameras.get(e);return u===void 0&&(u=e.clone(),this._reflectionCameras.set(e,u)),u}}};y.ReflectorShader={name:"ReflectorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,fragmentShader:`
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		varying vec4 vUv;

		#include <logdepthbuf_pars_fragment>

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			#include <logdepthbuf_fragment>

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};export{y as Reflector};
