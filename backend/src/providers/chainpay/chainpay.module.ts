import { Module } from '@nestjs/common';
import { ChainPayService } from './chainpay.service.js';
@Module({ providers: [ChainPayService], exports: [ChainPayService] })
export class ChainPayModule {}
