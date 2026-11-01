import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTradeSignalDto {
  @IsString() @MinLength(3) @MaxLength(100) title!: string;
  @IsString() @MinLength(3) @MaxLength(24) @Matches(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/) pair!: string;
  @IsDateString() startsAt!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) roiPercent!: number;
  @IsInt() @Min(1) @Max(365) lockDays!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) minimumInvestment!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) maximumInvestment!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) interestWithdrawalDays!: number[];
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) interestWindowStart!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) interestWindowEnd!: string;
  @IsString() @MinLength(3) @MaxLength(64) timezone!: string;
}

export class JoinTradeDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
}

export class WithdrawTradeInterestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsString() @MinLength(8) @MaxLength(256) destinationAddress!: string;
  @IsString() @MinLength(1) @MaxLength(80) network!: string;
}
