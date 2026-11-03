import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class DepositRequestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(256) txid?: string;
}
export class WithdrawalRequestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsIn(['trading', 'referral']) balanceType!: 'trading' | 'referral';
  @IsString() @MinLength(8) @MaxLength(256) destinationAddress!: string;
  @IsString() @MinLength(1) @MaxLength(80) network!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) pin?: string;
  @IsOptional() @IsString() @MaxLength(256) verificationToken?: string;
}
export class FinanceSettingsDto {
  @IsString() @MaxLength(256) depositWalletAddress!: string;
  @IsString() @MaxLength(80) depositNetwork!: string;
  @IsString() @MaxLength(2000) depositInstructions!: string;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0) minimumDeposit!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0) minimumWithdrawal!: number;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(1) @Max(3650) capitalLockDays!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) withdrawalDays!: number[];
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) withdrawalWindowStart!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) withdrawalWindowEnd!: string;
  @IsString() @MaxLength(64) withdrawalTimezone!: string;
}
export class ReviewFinanceDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}
