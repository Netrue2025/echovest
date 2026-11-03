import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class StartGuestChatDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class SendSupportMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}
