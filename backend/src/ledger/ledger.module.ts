import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LedgerEntry, LedgerEntrySchema } from './ledger-entry.schema.js';
@Module({ imports: [MongooseModule.forFeature([{ name: LedgerEntry.name, schema: LedgerEntrySchema }])], exports: [MongooseModule] })
export class LedgerModule {}
