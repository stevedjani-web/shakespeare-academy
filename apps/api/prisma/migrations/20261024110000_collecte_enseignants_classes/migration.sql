-- CreateTable
CREATE TABLE "teacher_submission_classes" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "teacher_submission_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_submission_classes_classId_idx" ON "teacher_submission_classes"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_submission_classes_submissionId_classId_key" ON "teacher_submission_classes"("submissionId", "classId");

-- AddForeignKey
ALTER TABLE "teacher_submission_classes" ADD CONSTRAINT "teacher_submission_classes_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "teacher_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_submission_classes" ADD CONSTRAINT "teacher_submission_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

