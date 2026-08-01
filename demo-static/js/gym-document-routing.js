(function(){
  'use strict';
  function encode(value){return btoa(unescape(encodeURIComponent(JSON.stringify(value))));}
  function profile(){return window.AxtorGymPrintSettings?.cached?.().profile||'a4';}
  function normalize(data,type){
    const d=data||{};
    return {
      template:profile()==='80mm'?'thermal-80':profile()==='58mm'?'thermal-58':'modern-a4',
      documentType:type||d.documentType||'membership_invoice',
      documentNo:d.documentNo||d.invoiceNo||d.paymentNo||d.membershipNo||d.id,
      date:d.date||d.paidAt||d.createdAt||new Date().toISOString(),
      customer:{name:d.memberName||d.member?.name||d.name||'Member',code:d.memberNumber||d.member?.memberNumber||''},
      items:[{description:d.planName||d.plan?.name||d.description||'Gym membership',quantity:1,unit:'membership',price:Number(d.amount||d.total||d.subscriptionFee||0),amount:Number(d.amount||d.total||d.subscriptionFee||0)}],
      total:Number(d.amount||d.total||d.subscriptionFee||0),
      paid:Number(d.paidAmount||d.amountPaid||d.amount||0),
      balance:Number(d.balance||d.outstanding||0),
      gym:{memberNumber:d.memberNumber||d.member?.memberNumber||'',plan:d.planName||d.plan?.name||'',startDate:d.startDate||'',endDate:d.endDate||'',nextDueDate:d.nextDueDate||d.dueDate||'',trainer:d.trainerName||d.trainer?.name||'',facility:d.facilityName||d.facility?.name||'',paymentSchedule:d.paymentSchedule||d.installmentPlan||''}
    };
  }
  function url(data,type){return 'invoice-view.html?data='+encodeURIComponent(encode(normalize(data,type)));}
  function open(data,type){window.open(url(data,type),'_blank','noopener');}
  document.addEventListener('click',function(e){
    const el=e.target.closest('[data-gym-print-document]');if(!el)return;
    e.preventDefault();
    let data={};try{data=JSON.parse(el.dataset.gymPrintDocument||'{}');}catch{}
    open(data,el.dataset.documentType||'membership_invoice');
  },true);
  window.AxtorGymDocuments={normalize,url,open};
})();