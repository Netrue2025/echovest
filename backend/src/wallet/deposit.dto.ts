import { IsIn, IsString, Matches } from 'class-validator';

export class MockDepositEventDto {
  @IsString() @Matches(/^ev_[a-f0-9-]{36}$/i) externalReference!: string;
  @IsIn(['pending', 'confirmed', 'failed', 'invalid']) status!: 'pending' | 'confirmed' | 'failed' | 'invalid';
  @IsString() @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/) amount!: string;
}
