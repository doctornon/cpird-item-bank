export function summarizeMeq(document) {
 const stages = document.stages || [];
 const questions = stages.flatMap(s => s.questions || []);
 return {stages:stages.length,questions:questions.length,minutes:stages.reduce((n,s)=>n+Number(s.minutes||0),0),points:questions.reduce((n,q)=>n+Number(q.points||0),0)};
}
export function reviewMeq(document) {
 const warnings=[];const total=summarizeMeq(document);
 for(const [i,s] of (document.stages||[]).entries()) {
 const points=(s.questions||[]).reduce((n,q)=>n+Number(q.points||0),0);
 if(s.sourcePoints!=null && points!==s.sourcePoints) warnings.push(`ตอนที่ ${i+1}: คะแนนรายข้อรวม ${points} แต่หัวตอนระบุ ${s.sourcePoints}`);
 if(s.sourceQuestionCount!=null && s.questions.length!==s.sourceQuestionCount) warnings.push(`ตอนที่ ${i+1}: พบ ${s.questions.length} คำถาม แต่หัวตอนระบุ ${s.sourceQuestionCount}`);
 }
 if(document.sourcePoints!=null && total.points!==document.sourcePoints) warnings.push(`คะแนนรายข้อรวม ${total.points} แต่หน้าปกระบุ ${document.sourcePoints}`);
 if(document.sourceMinutes!=null && total.minutes!==document.sourceMinutes) warnings.push(`เวลารวม ${total.minutes} นาที แต่หน้าปกระบุ ${document.sourceMinutes}`);
 return warnings;
}
export function validateMeq(row) {
 if(!row.title?.trim()) return 'กรุณาระบุชื่อเคส';
 if(!Number.isInteger(Number(row.academic_year)) || row.academic_year<2400 || row.academic_year>3000) return 'กรุณาระบุปีการศึกษา พ.ศ. ให้ถูกต้อง';
 if(row.exam_year && (!Number.isInteger(Number(row.exam_year)) || row.exam_year<2400 || row.exam_year>3000)) return 'กรุณาระบุปีสอบ พ.ศ. ให้ถูกต้อง';
 if(!row.document?.stages?.length) return 'กรุณาเพิ่มอย่างน้อย 1 ตอน';
 for(const [i,s] of row.document.stages.entries()) {
 if(!s.scenario?.trim()) return `กรุณาระบุข้อมูลผู้ป่วยในตอนที่ ${i+1}`;
 if(!Number.isFinite(Number(s.minutes)) || Number(s.minutes)<=0) return `กรุณาระบุเวลาในตอนที่ ${i+1}`;
 if(!s.questions?.length) return `กรุณาเพิ่มคำถามในตอนที่ ${i+1}`;
 for(const q of s.questions) if(!q.prompt?.trim() || !Number.isFinite(Number(q.points)) || Number(q.points)<0) return `ตรวจข้อความและคะแนนคำถามในตอนที่ ${i+1}`;
 }
 return '';
}
export const newQuestion=()=>({id:crypto.randomUUID(),prompt:'',points:0,modelAnswer:'',rubric:''});
export const newStage=()=>({id:crypto.randomUUID(),title:'',scenario:'',minutes:5,questions:[newQuestion()]});
export const newCase=()=>({title:'',academic_year:2568,exam_year:2569,document:{version:1,instructions:'เปิดทีละตอนตามเวลาหรือสัญญาณ ห้ามอ่านล่วงหน้าและห้ามย้อนกลับแก้ไข',competency:'',taxonomy:{},stages:[newStage()]}});
