import { IsDateString, IsNumber, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTradeSignalDto {
  @IsString() @MinLength(3) @MaxLength(100) title!: string;
  @IsString() @MinLength(3) @MaxLength(24) @Matches(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/) pair!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) roiPercent!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) minimumInvestment!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) maximumInvestment!: number;
}

export class JoinTradeDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
}

export class WithdrawTradeInterestDto {
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.01) amount!: number;
  @IsString() @MinLength(8) @MaxLength(256) destinationAddress!: string;
  @IsString() @MinLength(1) @MaxLength(80) network!: string;
}
