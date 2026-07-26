import { prisma } from '../db/prisma.js';
const roles:Record<string,Record<string,string[]>>={
 furniture:{'Furniture Manager':['furniture.*'],'Sales Designer':['furniture.orders.*','furniture.approvals.*'],'Production User':['furniture.production.*'],'Installer':['furniture.installation.*']},
 workshop:{'Workshop Manager':['workshop.*'],'Service Advisor':['workshop.vehicles.*','workshop.estimates.*','workshop.jobs.*'],'Technician':['workshop.jobs.view','workshop.jobs.update','workshop.quality.create'],'Parts Controller':['workshop.parts.*'],'Workshop Cashier':['workshop.invoices.view','workshop.payments.create']},
 wholesale:{'Wholesale Manager':['wholesale.*'],'Sales Representative':['wholesale.orders.*','wholesale.customers.*'],'Warehouse Picker':['wholesale.pick.*','wholesale.pack.*'],'Dispatch User':['wholesale.dispatch.*'],'Collections User':['wholesale.collections.*']}
};
const businessId=process.argv[2],industry=process.argv[3]; if(!businessId||!roles[industry]) throw new Error('Usage: seed-release-d-roles <businessId> <furniture|workshop|wholesale>');
for(const [name,permissions] of Object.entries(roles[industry])) await prisma.role.upsert({where:{businessId_name:{businessId,name}},create:{businessId,name,isSystemRole:true,permissions},update:{isSystemRole:true,permissions}});
await prisma.$disconnect();
