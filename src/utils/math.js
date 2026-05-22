/**
 * @namespace vec
 * 2D vector operations utility.
 */
export const vec = {
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    mul: (v, scalar) => ({ x: v.x * scalar, y: v.y * scalar }),
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
    mag: (v) => Math.sqrt(vec.dot(v, v)),
    normalize: (v) => {
        const m = vec.mag(v);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    }
};

/**
 * Calculates ray-circle intersection.
 * @returns {number|null} Distance (t) along the ray, or null if no intersection occurs.
 */
export function intersectCircle(origin, dir, circleCenter, circleRadius) {
    const L = vec.sub(origin, circleCenter);
    const a = vec.dot(dir, dir);
    const b = 2 * vec.dot(dir, L);
    const c = vec.dot(L, L) - circleRadius * circleRadius;
    const delta = b * b - 4 * a * c;

    if (delta < 0) return null;

    const t1 = (-b - Math.sqrt(delta)) / (2 * a);
    const t2 = (-b + Math.sqrt(delta)) / (2 * a);

    if (t1 > 0.001) return t1;
    if (t2 > 0.001) return t2;
    return null;
}

/**
 * Calculates ray-segment intersection.
 * @returns {Object|null} Object containing distance (t) and normal vector, or null.
 */
export function intersectSegment(origin, dir, p1, p2) {
    const v1 = { x: origin.x - p1.x, y: origin.y - p1.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v3 = { x: -dir.y, y: dir.x };

    const dot = v2.x * v3.x + v2.y * v3.y;
    if (Math.abs(dot) < 0.00001) return null;

    const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

    if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
        const n = { x: v2.y, y: -v2.x };
        const len = Math.sqrt(n.x * n.x + n.y * n.y);
        return { t: t1, normal: { x: n.x / len, y: n.y / len } };
    }
    return null;
}

/**
 * Refracts a directional vector using Snell's Law.
 * @returns {Object|null} Normalized refracted vector, or null on Total Internal Reflection (TIR).
 */
export function refract(incident, normal, eta) {
    let cosi = vec.dot(incident, normal);

    if (cosi > 0) {
        normal = vec.mul(normal, -1);
        cosi = vec.dot(incident, normal);
    }

    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;

    return vec.normalize(
        vec.sub(
            vec.mul(incident, eta),
            vec.mul(normal, eta * cosi + Math.sqrt(k))
        )
    );
}