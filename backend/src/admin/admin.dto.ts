import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { DELEGATABLE_ADMIN_PERMISSION_CODES } from './admin-permissions.js';

export class AdminSigninDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
export class CreateAdminDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) @Matches(/[A-Z]/) @Matches(/\d/) @Matches(/[^A-Za-z0-9]/) password!: string;
  @IsArray() @ArrayMaxSize(DELEGATABLE_ADMIN_PERMISSION_CODES.length) @ArrayUnique() @IsIn(DELEGATABLE_ADMIN_PERMISSION_CODES, { each: true }) permissions!: string[];
}
export class UpdateAdminPermissionsDto {
  @IsArray() @ArrayMaxSize(DELEGATABLE_ADMIN_PERMISSION_CODES.length) @ArrayUnique() @IsIn(DELEGATABLE_ADMIN_PERMISSION_CODES, { each: true }) permissions!: string[];
}
export class UpdateAdminStatusDto { @IsBoolean() disabled!: boolean; }
export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}
export class UpdateUserPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) @Matches(/[A-Z]/) @Matches(/\d/) @Matches(/[^A-Za-z0-9]/) password!: string;
}
export class UpdateUserControlsDto {
  @IsOptional() @IsBoolean() disabled?: boolean;
}
export class UpdateUserWithdrawalDto { @IsBoolean() withdrawalsDisabled!: boolean; }
