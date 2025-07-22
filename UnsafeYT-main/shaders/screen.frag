#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_sampler;
uniform sampler2D u_shuffle;

vec2 getNormal( vec2 uv ){
    vec2 offset = vec2(0.0065,0.0065);
    vec2 center = round((uv+offset)*80.0)/80.0;
    return (center - (uv+offset))*80.0;
}

float getAxis( vec2 uv ){
    vec2 normal = getNormal( uv );
    float axis = abs(normal.x) > 0.435 ? 1.0 : 0.0;
    return abs(normal.y) > 0.4 ? 2.0 : axis;
}

float getGrid( vec2 uv ){
    float axis = getAxis( uv );
    return axis > 0.0 ? 1.0 : 0.0;
}

vec4 getColor( vec2 uv ){
    vec2 shuffle_sample = texture(u_shuffle, uv).rg;
    vec2 base_new_uv = uv + shuffle_sample;

    vec4 c = texture(u_sampler, base_new_uv);
    return vec4(1.0 - c.rgb, c.a);
}

vec4 getGridFix( vec2 uv ){
    vec2 normal = getNormal( uv );
    vec4 base = getColor( uv );
    vec4 outline = getColor( uv + normal*0.002 );

    float grid = getGrid( uv );
    return mix(base,outline,grid);
}

vec4 getSmoothed( vec2 uv, float power, float slice ){
    vec4 result = vec4(0.0,0.0,0.0,0.0);

    float PI = 3.14159265;
    float TAU = PI*2.0;

    for( float i=0.0; i < 8.0; i++ ){
        float angle = ((i/8.0)*TAU) + (PI/2.0) + slice;
        vec2 normal = vec2(sin(angle),cos(angle)*1.002);

        result += getGridFix( uv + normal*power );
    }

    return result/8.0;
}

void main() {
    vec2 uv = vec2(v_texCoord.x, -v_texCoord.y + 1.0);

    float axis = getAxis( uv );
    float grid = axis > 0.0 ? 1.0 : 0.0;

    float slices[3] = float[3](0.0,0.0,3.14159265);

    vec4 main = getGridFix( uv );
    vec4 outline = getSmoothed( uv, 0.001, slices[int(axis)] );

    main = mix(main,outline,grid);

    fragColor = main;
    //fragColor = vec4(slices[int(axis)],0.0,0.0,1.0);
    //fragColor = vec4(normal,0.0,1.0);
    //fragColor = vec4(grid,grid,grid , 1);
}
