import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class DepositRequestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(256) txid?: string;
}
export class WithdrawalRequestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsIn(['trading', 'referral']) balanceType!: 'trading' | 'referral';
  @IsString() @MinLength(8) @MaxLength(256) destinationAddress!: string;
  @IsString() @MinLength(1) @MaxLength(80) network!: string;
}
export class FinanceSettingsDto {
  @IsString() @MaxLength(256) depositWalletAddress!: string;
  @IsString() @MaxLength(80) depositNetwork!: string;
  @IsString() @MaxLength(2000) depositInstructions!: string;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0) minimumDeposit!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0) minimumWithdrawal!: number;
}
export class ReviewFinanceDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}
