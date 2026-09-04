import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAVITY,
  calculateInclineAcceleration,
  positionAtTime,
  velocityAtTime,
  timeAtPosition,
  linearRegression,
  quadraticRegression,
  calculateTangent,
  calculateSecantSlope,
  addReactionTimeJitter
} from '../src/downhillPhysics.js';

describe('downhillPhysics - Incline Kinematics', () => {
  test('acceleration on frictionless incline follows a = g * sin(theta)', () => {
    const angle = 5.0; // degrees
    const expected = GRAVITY * Math.sin((angle * Math.PI) / 180);
    const actual = calculateInclineAcceleration(angle, 0);
    assert.ok(Math.abs(actual - expected) < 1e-6);
  });

  test('acceleration reduces with friction', () => {
    const angle = 10.0;
    const mu = 0.01;
    const aSmooth = calculateInclineAcceleration(angle, 0);
    const aRough = calculateInclineAcceleration(angle, mu);
    assert.ok(aRough < aSmooth);
    assert.ok(aRough > 0);
  });

  test('position and velocity time progression', () => {
    const a = 1.2; // m/s^2
    const v0 = 0.0;
    const x0 = 0.1;
    const t = 2.0;

    const x = positionAtTime(t, x0, v0, a);
    const v = velocityAtTime(t, v0, a);

    // x = 0.1 + 0.5 * 1.2 * 4 = 2.5 m
    assert.ok(Math.abs(x - 2.5) < 1e-6);
    // v = 0 + 1.2 * 2 = 2.4 m/s
    assert.ok(Math.abs(v - 2.4) < 1e-6);
  });

  test('timeAtPosition correctly inverts quadratic trajectory', () => {
    const a = 0.8;
    const v0 = 0.2;
    const x0 = 0.0;
    const targetX = 1.6;

    const t = timeAtPosition(targetX, x0, v0, a);
    assert.ok(t !== null);
    const reconstructedX = positionAtTime(t, x0, v0, a);
    assert.ok(Math.abs(reconstructedX - targetX) < 1e-5);
  });
});

describe('downhillPhysics - Regression & Tangents', () => {
  test('quadratic regression recovers exact parabola parameters', () => {
    // y = 0.45 * x^2 + 0.10 * x + 0.05
    const trueA = 0.45;
    const trueB = 0.10;
    const trueC = 0.05;

    const points = [
      { x: 0.0, y: trueC },
      { x: 0.5, y: trueA * 0.25 + trueB * 0.5 + trueC },
      { x: 1.0, y: trueA * 1.0 + trueB * 1.0 + trueC },
      { x: 1.5, y: trueA * 2.25 + trueB * 1.5 + trueC },
      { x: 2.0, y: trueA * 4.0 + trueB * 2.0 + trueC },
      { x: 2.5, y: trueA * 6.25 + trueB * 2.5 + trueC }
    ];

    const fit = quadraticRegression(points);
    assert.equal(fit.valid, true);
    assert.ok(Math.abs(fit.a - trueA) < 1e-5, `Expected A=${trueA}, got ${fit.a}`);
    assert.ok(Math.abs(fit.b - trueB) < 1e-5, `Expected B=${trueB}, got ${fit.b}`);
    assert.ok(Math.abs(fit.c - trueC) < 1e-5, `Expected C=${trueC}, got ${fit.c}`);
    assert.ok(fit.r2 > 0.9999);
  });

  test('linear regression recovers exact straight line', () => {
    // v = 0.90 * t + 0.10
    const trueM = 0.90;
    const trueB = 0.10;
    const points = [
      { x: 0.5, y: trueM * 0.5 + trueB },
      { x: 1.0, y: trueM * 1.0 + trueB },
      { x: 1.5, y: trueM * 1.5 + trueB },
      { x: 2.0, y: trueM * 2.0 + trueB },
      { x: 2.5, y: trueM * 2.5 + trueB }
    ];

    const fit = linearRegression(points);
    assert.ok(Math.abs(fit.slope - trueM) < 1e-5);
    assert.ok(Math.abs(fit.intercept - trueB) < 1e-5);
    assert.ok(fit.r2 > 0.9999);
  });

  test('tangent line slope matches exact derivative 2*A*t + B', () => {
    const quadFit = { a: 0.45, b: 0.10, c: 0.05 };
    const t0 = 1.4;
    const tangent = calculateTangent(quadFit, t0);

    const expectedSlope = 2 * quadFit.a * t0 + quadFit.b; // 2 * 0.45 * 1.4 + 0.10 = 1.36
    assert.ok(Math.abs(tangent.slope - expectedSlope) < 1e-6);
    // Line evaluated at t0 must equal y0
    assert.ok(Math.abs(tangent.evaluate(t0) - tangent.y0) < 1e-6);
  });

  test('relationship: quadratic coefficient A is half the velocity slope m', () => {
    // If x(t) = (1/2)*a*t^2 + v0*t + x0, then v(t) = a*t + v0
    const acceleration = 1.6;
    const v0 = 0.3;
    const x0 = 0.0;

    const times = [0.2, 0.6, 1.0, 1.4, 1.8, 2.2];
    const xPoints = times.map(t => ({ x: t, y: positionAtTime(t, x0, v0, acceleration) }));
    const quadFit = quadraticRegression(xPoints);

    // Instantaneous velocities at each point
    const vPoints = times.map(t => ({ x: t, y: calculateTangent(quadFit, t).slope }));
    const vFit = linearRegression(vPoints);

    // Second-degree coefficient A vs slope of velocity m
    assert.ok(Math.abs(quadFit.a - (vFit.slope / 2)) < 1e-4, 'A must equal 0.5 * slope(v)');
    // First-degree coefficient B vs y-intercept of velocity
    assert.ok(Math.abs(quadFit.b - vFit.intercept) < 1e-4, 'B must equal intercept(v)');
  });
});
