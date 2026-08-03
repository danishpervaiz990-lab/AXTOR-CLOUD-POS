import fs from 'node:fs/promises';

const sourcePath = new URL('./qa-retail-r13-seven-role-audit.mjs', import.meta.url);
let source = await fs.readFile(sourcePath, 'utf8');

const replaceExact = (from, to, label) => {
  if (!source.includes(from)) {
    throw new Error(`Retail R-13 audit adapter could not find ${label}`);
  }
  source = source.replace(from, to);
};

replaceExact(
`for (const user of sevenUsers) {
  user.token = await login(user.email, user.password);
  const me = await request('/api/v1/auth/me', { token: user.token, expected: [200] });
  const observed = [me.payload?.user?.role, ...(Array.isArray(me.payload?.user?.roles) ? me.payload.user.roles : [])].filter(Boolean);
  user.observedRoles = [...new Set(observed.map(String))];
  if (!user.observedRoles.some((role) => roleFamily(role) === roleFamily(user.role))) {
    throw new Error(\`${'${user.label}'} authenticated without the expected ${'${user.role}'} role\`);
  }
  if (String(me.payload?.business?.slug || '').toLowerCase() !== String(businessSlug).toLowerCase()) {
    throw new Error(\`${'${user.label}'} resolved to the wrong tenant\`);
  }
}`,
`for (const user of sevenUsers) {
  user.token = await login(user.email, user.password);
  let me = await request('/api/v1/auth/me', { token: user.token, expected: [200] });
  user.passwordRotation = 'NOT_REQUIRED';

  if (me.payload?.user?.mustChangePassword === true) {
    const rotatedPassword = makePassword(\`${'${user.role}'}Rotated\`);
    await request('/api/v1/auth/change-password', {
      method: 'POST',
      token: user.token,
      body: {
        currentPassword: user.password,
        newPassword: rotatedPassword,
      },
      expected: [200],
      retries: 1,
    });
    user.password = rotatedPassword;
    user.passwordRotation = 'COMPLETED';
    me = await request('/api/v1/auth/me', { token: user.token, expected: [200] });
    if (me.payload?.user?.mustChangePassword === true) {
      throw new Error(\`${'${user.label}'} remained blocked after mandatory password rotation\`);
    }
  }

  const observed = [me.payload?.user?.role, ...(Array.isArray(me.payload?.user?.roles) ? me.payload.user.roles : [])].filter(Boolean);
  user.observedRoles = [...new Set(observed.map(String))];
  if (!user.observedRoles.some((role) => roleFamily(role) === roleFamily(user.role))) {
    throw new Error(\`${'${user.label}'} authenticated without the expected ${'${user.role}'} role\`);
  }
  if (String(me.payload?.business?.slug || '').toLowerCase() !== String(businessSlug).toLowerCase()) {
    throw new Error(\`${'${user.label}'} resolved to the wrong tenant\`);
  }
}`,
  'seven-user authentication loop',
);

replaceExact(
`    observedRoles: user.observedRoles,
    result: 'PASS',`,
`    observedRoles: user.observedRoles,
    passwordRotation: user.passwordRotation,
    result: 'PASS',`,
  'user password-rotation evidence',
);

replaceExact(
`    permissionMatricesPassed: permissionEvidence.filter((entry) => entry.result === 'PASS').length,`,
`    permissionMatricesPassed: permissionEvidence.filter((entry) => entry.result === 'PASS').length,
    passwordRotationsCompleted: sevenUsers.filter((user) => user.passwordRotation === 'COMPLETED').length,
    passwordRotationBlocksRemaining: sevenUsers.filter((user) => !['COMPLETED', 'NOT_REQUIRED'].includes(user.passwordRotation)).length,`,
  'password-rotation summary evidence',
);

replaceExact(
`    && permissionEvidence.every((entry) => entry.result === 'PASS')`,
`    && permissionEvidence.every((entry) => entry.result === 'PASS')
    && sevenUsers.every((user) => ['COMPLETED', 'NOT_REQUIRED'].includes(user.passwordRotation))`,
  'password-rotation result enforcement',
);

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
