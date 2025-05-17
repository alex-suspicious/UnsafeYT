precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_sampler; // Your main image texture
uniform sampler2D u_shuffle; // Your offset map texture

void main() {
    vec2 uv = vec2(v_texCoord.x, -v_texCoord.y + 1.0);

    vec4 shuffle_sample = texture2D(u_shuffle, (uv - 0.004));
    vec2 decoded_offset = (shuffle_sample.xy * 2.0) - 1.0;

    vec2 base_new_uv = uv + decoded_offset;
    vec4 c = texture2D(u_sampler, base_new_uv);

    gl_FragColor = vec4(1.0-c.rgb, c.a);
}