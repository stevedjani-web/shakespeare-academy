import { Module } from '@nestjs/common';
import { NumberSequenceService } from './number-sequence.service';

@Module({
  providers: [NumberSequenceService],
  exports: [NumberSequenceService],
})
export class NumberSequenceModule {}
