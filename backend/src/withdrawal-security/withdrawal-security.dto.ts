import { Allow, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class SetWithdrawalPinDto { @IsString() @Matches(/^\d{6}$/) pin!: string; }
export class WithdrawalContextDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(320) destinationAddress!: string;
  @IsString() @MaxLength(80) network!: string;
  @IsString() @MaxLength(80) source!: string;
}
export class WithdrawalAuthenticationResponseDto extends WithdrawalContextDto { @Allow() response?: unknown; }
export class WithdrawalVerificationDto extends WithdrawalContextDto {
  @IsOptional() @IsString() @Matches(/^\d{6}$/) pin?: string;
  @IsOptional() @IsString() @MaxLength(256) verificationToken?: string;
}
