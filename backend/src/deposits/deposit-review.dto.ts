import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class DepositReviewDto {
  @IsIn(['reject', 'retry_verification']) action!: 'reject' | 'retry_verification';
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
