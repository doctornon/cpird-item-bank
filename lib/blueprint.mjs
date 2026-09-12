export const newBlueprint=()=>({version:1,rowField:'specialty_id',columnField:'physician_task',cells:[]});
export function coverage(plan,items){
 const cells=(plan.cells||[]).map(cell=>({...cell,actual:items.filter(item=>String(item[plan.rowField]??'')===cell.row&&String(item[plan.columnField]??'')===cell.column).length}));
 const unmatched=items.filter(item=>!cells.some(cell=>String(item[plan.rowField]??'')===cell.row&&String(item[plan.columnField]??'')===cell.column)).length;
 const valid=cells.length>0&&cells.every(c=>c.row&&c.column&&Number.isInteger(c.target)&&c.target>0)&&new Set(cells.map(c=>JSON.stringify([c.row,c.column]))).size===cells.length;
 return {cells,unmatched,target:cells.reduce((n,c)=>n+(Number(c.target)||0),0),valid,complete:valid&&!unmatched&&cells.every(c=>c.target===c.actual)};
}
