import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';
export class SignupDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/[A-Z]/) @Matches(/\d/) @Matches(/[^A-Za-z0-9]/) password!: string;
  @IsString() @MinLength(8) @MaxLength(128) passwordConfirmation!: string;
}
export class EmailCodeDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class EmailDto { @IsEmail() @MaxLength(254) email!: string; }
export class SigninDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
export class ResetPasswordDto extends EmailCodeDto {
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/[A-Z]/) @Matches(/\d/) @Matches(/[^A-Za-z0-9]/) newPassword!: string;
  @IsString() @MinLength(8) @MaxLength(128) passwordConfirmation!: string;
}
