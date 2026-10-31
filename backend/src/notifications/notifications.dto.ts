import { IsIn, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PushSubscriptionDto {
  @IsUrl({ require_tld: false }) @MaxLength(2048) endpoint!: string;
  @IsString() @MinLength(16) @MaxLength(256) p256dh!: string;
  @IsString() @MinLength(8) @MaxLength(128) auth!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(8640000000000000) expirationTime?: number | null;
}

export class RemovePushSubscriptionDto {
  @IsUrl({ require_tld: false }) @MaxLength(2048) endpoint!: string;
}

export class BroadcastNotificationDto {
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(3) @MaxLength(2000) message!: string;
  @IsOptional() @IsIn(['general']) category?: 'general';
}
