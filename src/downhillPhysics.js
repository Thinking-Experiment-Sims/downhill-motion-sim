/**
 * downhillPhysics.js - Pure Physics and Statistical Modeling Engine
 * 
 * Part of "The Thinking Experiment" (PhysicsKit).
 * Zero DOM dependencies. Safe for Node.js unit testing and browser ESM.
 * 
 * Standards:
 * - Metric/SI units only: meters (m), seconds (s), meters/second (m/s), m/s^2, degrees.
 * - Numerically stable 3x3 quadratic regression & linear regression.
 * - Instantaneous tangent calculations and secant approximations.
 */

export const GRAVITY = 9.80; // m/s^2

/**
 * Calculates acceleration along an incline.
 * @param {number} angleDeg - Incline angle in degrees.
 * @param {number} muFriction - Coefficient of rolling/kinetic friction (default 0).
 * @returns {number} Acceleration down the ramp in m/s^2.
 */
export function calculateInclineAcceleration(angleDeg, muFriction = 0) {
  const thetaRad = (angleDeg * Math.PI) / 180;
  const aGrav = GRAVITY * Math.sin(thetaRad);
  const aFric = muFriction * GRAVITY * Math.cos(thetaRad);
  return Math.max(0, aGrav - aFric);
}

/**
 * Evaluates position along the ramp at time t.
 * x(t) = x0 + v0*t + 0.5*a*t^2
 */
export function positionAtTime(t, x0, v0, a) {
  if (t < 0) return x0;
  return x0 + v0 * t + 0.5 * a * t * t;
}

/**
 * Evaluates instantaneous velocity at time t.
 * v(t) = v0 + a*t
 */
export function velocityAtTime(t, v0, a) {
  if (t < 0) return v0;
  return v0 + a * t;
}

/**
 * Solves for the time t when the cart reaches target position xTarget.
 * 0.5*a*t^2 + v0*t + (x0 - xTarget) = 0
 * @returns {number|null} Time in seconds, or null if unreachable.
 */
export function timeAtPosition(xTarget, x0, v0, a) {
  const dx = xTarget - x0;
  if (dx === 0) return 0;
  if (dx < 0 && v0 <= 0 && a <= 0) return null;

  if (Math.abs(a) < 1e-7) {
    if (Math.abs(v0) < 1e-7) return null;
    const t = dx / v0;
    return t >= 0 ? t : null;
  }

  // Quadratic equation: A*t^2 + B*t + C = 0 with A = 0.5*a, B = v0, C = -dx
  const A = 0.5 * a;
  const B = v0;
  const C = -dx;
  const discriminant = B * B - 4 * A * C;

  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-B + sqrtDisc) / (2 * A);
  const t2 = (-B - sqrtDisc) / (2 * A);

  const validTimes = [t1, t2].filter(t => t >= 0);
  if (validTimes.length === 0) return null;
  return Math.min(...validTimes);
}

/**
 * Fits a linear model: y = m*x + b
 * @param {Array<{x: number, y: number}>} points
 * @returns {{ slope: number, intercept: number, r2: number, n: number }}
 */
export function linearRegression(points) {
  const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = valid.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0, n };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = valid[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: sumY / n, r2: 0, n };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Compute R^2
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = valid[i];
    const yPred = slope * x + intercept;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - yPred) ** 2;
  }

  const r2 = ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2, n };
}

/**
 * Fits a quadratic model: y = A*x^2 + B*x + C using least squares normal equations.
 * @param {Array<{x: number, y: number}>} points
 * @returns {{ a: number, b: number, c: number, r2: number, n: number, valid: boolean }}
 */
export function quadraticRegression(points) {
  const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = valid.length;
  if (n < 3) {
    return { a: 0, b: 0, c: 0, r2: 0, n, valid: false };
  }

  let s4 = 0, s3 = 0, s2 = 0, s1 = 0, s0 = n;
  let sy2 = 0, sy1 = 0, sy0 = 0;

  for (let i = 0; i < n; i++) {
    const x = valid[i].x;
    const y = valid[i].y;
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x3 * x;

    s4 += x4;
    s3 += x3;
    s2 += x2;
    s1 += x;
    sy2 += y * x2;
    sy1 += y * x;
    sy0 += y;
  }

  // Solve 3x3 system:
  // [ s4  s3  s2 ] [ A ]   [ sy2 ]
  // [ s3  s2  s1 ] [ B ] = [ sy1 ]
  // [ s2  s1  s0 ] [ C ]   [ sy0 ]
  const M = [
    [s4, s3, s2, sy2],
    [s3, s2, s1, sy1],
    [s2, s1, s0, sy0]
  ];

  // Gaussian elimination with partial pivoting
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    if (Math.abs(M[i][i]) < 1e-12) {
      return { a: 0, b: 0, c: 0, r2: 0, n, valid: false };
    }

    for (let k = i + 1; k < 3; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= 3; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  // Back substitution
  const C = M[2][3] / M[2][2];
  const B = (M[1][3] - M[1][2] * C) / M[1][1];
  const A = (M[0][3] - M[0][2] * C - M[0][1] * B) / M[0][0];

  // Calculate R^2
  const meanY = sy0 / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const x = valid[i].x;
    const y = valid[i].y;
    const yPred = A * x * x + B * x + C;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - yPred) ** 2;
  }

  const r2 = ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { a: A, b: B, c: C, r2, n, valid: true };
}

/**
 * Calculates tangent line properties on a quadratic curve y = A*x^2 + B*x + C at x0.
 * Slope = 2*A*x0 + B
 * Line equation: y - y0 = slope * (x - x0) => y = slope * x + (y0 - slope * x0)
 */
export function calculateTangent(quadFit, x0) {
  const { a, b, c } = quadFit;
  const y0 = a * x0 * x0 + b * x0 + c;
  const slope = 2 * a * x0 + b;
  const intercept = y0 - slope * x0;

  return {
    x0,
    y0,
    slope,
    intercept,
    evaluate: (x) => slope * x + intercept
  };
}

/**
 * Calculates secant slope between two points (t1, x1) and (t2, x2).
 */
export function calculateSecantSlope(p1, p2) {
  const dt = p2.x - p1.x;
  if (Math.abs(dt) < 1e-7) return 0;
  return (p2.y - p1.y) / dt;
}

/**
 * Applies pseudo-random human reaction latency scatter for manual timing mode.
 * Simulates ±0.12 - 0.20s timing jitter while keeping data ordered.
 */
export function addReactionTimeJitter(actualTime, jitterAmount = 0.15, rng = Math.random) {
  // Box-Muller transform for normal distribution
  const u1 = Math.max(1e-6, rng());
  const u2 = Math.max(1e-6, rng());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const offset = z * (jitterAmount / 2.0);
  return Math.max(0, actualTime + offset);
}

/**
 * Formats data points for export or copy to clipboard, matching slope_tangents format.
 */
export function formatDataForExport(points, format = 'tsv') {
  if (format === 'csv') {
    return 'Time (s),Position (m)\n' + points.map(p => `${p.t.toFixed(3)},${p.x.toFixed(3)}`).join('\n');
  }
  // Default TSV (convenient for spreadsheet pasting)
  return 'Time (s)\tPosition (m)\n' + points.map(p => `${p.t.toFixed(3)}\t${p.x.toFixed(3)}`).join('\n');
}
