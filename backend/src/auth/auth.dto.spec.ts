import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { SignupDto } from './auth.dto.js';

describe('SignupDto', () => {
  it('rejects invalid signup data', async () => {
    const dto = Object.assign(new SignupDto(), { fullName: 'A', email: 'not-an-email', password: 'weak', passwordConfirmation: '' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['fullName', 'email', 'password', 'passwordConfirmation']));
  });
});
