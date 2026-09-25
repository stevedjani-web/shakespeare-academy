import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TimetableModule } from '../timetable/timetable.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TextbookModule } from '../textbook/textbook.module';
import { StudentsModule } from '../students/students.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AssistantHealth } from './assistant-health';
import { ASSISTANT_PROVIDER } from './assistant-provider.interface';
import { AnthropicAssistantProvider } from './anthropic-assistant.provider';

/** Lot 22 : assistant de rédaction de la messagerie (brouillons de réponse pour le personnel). */
@Module({
  imports: [
    AuditModule,
    SchoolModule,
    MessagingModule,
    TimetableModule,
    AttendanceModule,
    TextbookModule,
    StudentsModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantHealth,
    { provide: ASSISTANT_PROVIDER, useClass: AnthropicAssistantProvider },
  ],
  exports: [AssistantHealth],
})
export class AssistantModule {}
