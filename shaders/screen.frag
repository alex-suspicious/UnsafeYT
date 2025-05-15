precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_sampler; // Your main image texture
uniform sampler2D u_shuffle; // Your offset map texture

void main() {
    vec2 uv = vec2(v_texCoord.x, -v_texCoord.y + 1.0);

    vec4 shuffle_sample = texture2D(u_shuffle, uv);
    vec2 decoded_offset = (shuffle_sample.xy * 2.0) - 1.0; // Assuming R=dx, G=dy

    vec2 base_new_uv = uv + (decoded_offset+0.0038);

    float inset_amount = 0.0001;
    vec2 final_adjusted_uv = inset_amount + base_new_uv * (1.0 - (2.0 * inset_amount));

    vec4 c = texture2D(u_sampler, final_adjusted_uv);

    gl_FragColor = vec4(c.rgb, c.a);
}