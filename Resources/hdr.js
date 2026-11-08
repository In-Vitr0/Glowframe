'use strict';
// HDR light via WebGPU. Safari's 2D canvas stops at normal white;
// an rgba16float WebGPU canvas with extended tone mapping may glow brighter.
// CSS blur and CSS opacity would clamp the HDR light back to normal
// white (verified in Safari 27). That is why blur,
// color grading and opacity happen in the shader.
//
// The source is the small 2D light canvas, not the video itself: importExternalTexture
// returns only black for HDR/Dolby Vision videos in Safari. drawImage into the
// 2D canvas works with every video. Pixels are never read back.
globalThis.GlowHDR = (() => {
 const WGSL = `
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
 var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
 var o: VOut;
 o.pos = vec4f(p[i], 0.0, 1.0);
 o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
 return o;
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;

// Separable Gaussian blur: horizontal first, then vertical.
fn gauss(uv: vec2f, stepv: vec2f, sigma: f32, radius: f32) -> vec3f {
 var sum = vec3f(0.0);
 var wsum = 0.0;
 let r = i32(radius);
 for (var i = -r; i <= r; i++) {
  let x = f32(i);
  let w = exp(-x * x / (2.0 * sigma * sigma));
  sum += textureSampleLevel(src, samp, uv + stepv * x, 0.0).rgb * w;
  wsum += w;
 }
 return sum / wsum;
}

struct BlurU { stepv: vec2f, sigma: f32, radius: f32 };
@group(0) @binding(2) var<uniform> bu: BlurU;
@fragment fn blurH(in: VOut) -> @location(0) vec4f {
 return vec4f(gauss(in.uv, bu.stepv, bu.sigma, bu.radius), 1.0);
}

// Vertical blur plus brightness, contrast, saturation (like CSS filters) and opacity.
struct GradeU { stepv: vec2f, sigma: f32, radius: f32, brightness: f32, contrast: f32, saturation: f32, opacity: f32 };
@group(0) @binding(3) var<uniform> gu: GradeU;
@fragment fn grade(in: VOut) -> @location(0) vec4f {
 var c = gauss(in.uv, gu.stepv, gu.sigma, gu.radius) * gu.brightness;
 c = (c - 0.5) * gu.contrast + 0.5;
 let s = gu.saturation;
 c = vec3f(
  (0.213 + 0.787 * s) * c.r + (0.715 - 0.715 * s) * c.g + (0.072 - 0.072 * s) * c.b,
  (0.213 - 0.213 * s) * c.r + (0.715 + 0.285 * s) * c.g + (0.072 - 0.072 * s) * c.b,
  (0.213 - 0.213 * s) * c.r + (0.715 - 0.715 * s) * c.g + (0.072 + 0.928 * s) * c.b);
 return vec4f(max(c, vec3f(0.0)) * gu.opacity, 1.0);
}
`;

 function create(canvas) {
  const state = { ready: false, failed: false, reason: 'starting' };
  let device, context, sampler, blurPipe, gradePipe, uBlur, uGrade, t0, t1, blurGroup, gradeGroup, w = 0, h = 0;

  function fail(message) { state.failed = true; state.ready = false; state.reason = message; }

  (async () => {
   try {
    if (!navigator.gpu) throw new Error('no WebGPU');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no GPU adapter');
    device = await adapter.requestDevice();
    device.lost.then(info => fail('GPU device lost: ' + (info.message || info.reason)));
    device.addEventListener?.('uncapturederror', event => fail('WebGPU error: ' + event.error.message));
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('no WebGPU context');
    context.configure({ device, format: 'rgba16float', colorSpace: 'display-p3', toneMapping: { mode: 'extended' }, alphaMode: 'opaque' });
    const mode = context.getConfiguration?.()?.toneMapping?.mode;
    if (mode && mode !== 'extended') throw new Error('no extended tone mapping');
    const module = device.createShaderModule({ code: WGSL });
    const info = await module.getCompilationInfo?.();
    const errors = info?.messages?.filter(m => m.type === 'error') || [];
    if (errors.length) throw new Error('Shader: ' + errors[0].message);
    sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const pipe = entryPoint => device.createRenderPipeline({
     layout: 'auto',
     vertex: { module, entryPoint: 'vs' },
     fragment: { module, entryPoint, targets: [{ format: 'rgba16float' }] },
     primitive: { topology: 'triangle-list' }
    });
    blurPipe = pipe('blurH');
    gradePipe = pipe('grade');
    const ubo = size => device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    uBlur = ubo(16); uGrade = ubo(32);
    state.ready = true; state.reason = 'ready';
   } catch (error) {
    fail(error.message || String(error));
   }
  })();

  function resize(nw, nh) {
   if (nw === w && nh === h) return false;
   t0?.destroy(); t1?.destroy();
   const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
   t0 = device.createTexture({ size: [nw, nh], format: 'rgba16float', usage });
   t1 = device.createTexture({ size: [nw, nh], format: 'rgba16float', usage });
   blurGroup = device.createBindGroup({ layout: blurPipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: sampler }, { binding: 1, resource: t0.createView() }, { binding: 2, resource: { buffer: uBlur } }] });
   gradeGroup = device.createBindGroup({ layout: gradePipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: sampler }, { binding: 1, resource: t1.createView() }, { binding: 3, resource: { buffer: uGrade } }] });
   w = nw; h = nh;
   canvas.width = nw; canvas.height = nh;
   return true;
  }

  function draw(encoder, view, pipeline, group) {
   const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
   pass.setPipeline(pipeline);
   pass.setBindGroup(0, group);
   pass.draw(3);
   pass.end();
  }

  // p: {source (2D canvas), capture, areaWidth, areaHeight, blur(px), brightness, contrast, saturation, opacity}
  function render(p) {
   if (!state.ready || state.failed) return false;
   try {
    const resized = resize(p.source.width, p.source.height);
    if (p.capture || resized) {
     device.queue.copyExternalImageToTexture({ source: p.source }, { texture: t0 }, [w, h]);
    }
    const sigmaX = Math.max(0.35, p.blur * w / p.areaWidth), sigmaY = Math.max(0.35, p.blur * h / p.areaHeight);
    const radius = s => Math.min(48, Math.ceil(s * 3));
    device.queue.writeBuffer(uBlur, 0, new Float32Array([1 / w, 0, sigmaX, radius(sigmaX)]));
    device.queue.writeBuffer(uGrade, 0, new Float32Array([0, 1 / h, sigmaY, radius(sigmaY), p.brightness, p.contrast, p.saturation, p.opacity]));
    const encoder = device.createCommandEncoder();
    draw(encoder, t1.createView(), blurPipe, blurGroup);
    draw(encoder, context.getCurrentTexture().createView(), gradePipe, gradeGroup);
    device.queue.submit([encoder.finish()]);
    return true;
   } catch (error) {
    fail(error.message || String(error));
    return false;
   }
  }

  return { state, render };
 }

 return { create };
})();
