#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_sampler;
uniform sampler2D u_shuffle;

void main() {
    vec2 uv = vec2(v_texCoord.x, -v_texCoord.y + 1.0);

    vec2 shuffle_sample = texture(u_shuffle, uv).rg;
    vec2 base_new_uv = uv + shuffle_sample;

    //float power = 0.05;

    //vec2 center = round(uv*80.0)/80.0;
    //vec2 normal = vec2(center.x - uv.x, center.y - uv.y)*80.0;
    //normal *= normal * normal;
  
    //vec2 final_adjusted_uv = base_new_uv + normal*power;

    vec4 c = texture(u_sampler, base_new_uv);

    fragColor = vec4(1.0-c.rgb, c.a);
    //fragColor = vec4(normal.xy,0 , c.a);
}