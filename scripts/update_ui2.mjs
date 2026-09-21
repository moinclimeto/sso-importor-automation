import re
import os

file_path = 'src/pages/CpcbRegistrationPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_ui = """        <div className="bg-white rounded-[16px] shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
              <Building2 size={18} className="text-emerald-600" />
            </div>
            <h3 className="text-[17px] font-semibold text-slate-800">General Information</h3>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-medium border border-emerald-100 ml-2">Step 2 — CPCB portal fields</span>
          </div>
          <p className="text-[13px] text-slate-500 mb-8 ml-[48px]">
            Company Details — Blank fields from CPCB portal. Fill manually if documents are not uploaded.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">GSTIN <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="gstin" value={autoData.gstin || ''} onChange={(e) => setAutoData(prev => ({...prev, gstin: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" placeholder="GSTIN *" required />
                {autoData.gstDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Company PAN <span className="text-red-500">*</span></label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="companyPan" value={autoData.companyPan || ''} onChange={(e) => setAutoData(prev => ({...prev, companyPan: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" placeholder="Enter Company PAN" required />
                {autoData.companyPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.companyPanDocumentPath} fileName="Company PAN" originalFileName={autoData.companyPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('company_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Company Name</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="companyName" value={autoData.companyName || ''} onChange={(e) => setAutoData(prev => ({...prev, companyName: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" placeholder="Enter Company Name" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Auth Person Name <span className="text-red-500">*</span></label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="authName" value={autoData.authName || ''} onChange={(e) => setAutoData(prev => ({...prev, authName: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" placeholder="Enter Authorized Person Name" required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Auth Person PAN <span className="text-red-500">*</span></label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="authPan" value={autoData.authPan || ''} onChange={(e) => setAutoData(prev => ({...prev, authPan: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" placeholder="Enter Auth Person PAN" required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Auth Person DOB <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="date" name="authDob" value={autoData.authDob || ''} onChange={(e) => setAutoData(prev => ({...prev, authDob: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors" required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">CIN (If Applicable)</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="cin" value={autoData.cin || ''} onChange={(e) => setAutoData(prev => ({...prev, cin: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-8 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors uppercase" placeholder="Enter CIN Number" />
                {autoData.cinDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.cinDocumentPath} fileName="CIN Document" originalFileName={autoData.cinOriginalName} hideText onChangeDocument={() => handleChangeDocument('cin')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">IEC (If Applicable)</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="iec" value={autoData.iec || ''} onChange={(e) => setAutoData(prev => ({...prev, iec: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-8 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors uppercase" placeholder="Enter IEC Number" />
                {autoData.iecDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.iecDocumentPath} fileName="IEC" originalFileName={autoData.iecOriginalName} hideText onChangeDocument={() => handleChangeDocument('iec')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Details of Products</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={autoData.detailsOfProductsPath ? getFileName(autoData.detailsOfProductsPath) : 'Please upload Details of Products'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-24 text-[13px] text-slate-500 truncate" />
                {autoData.detailsOfProductsPath ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.detailsOfProductsPath} fileName="Details of Products" originalFileName={autoData.detailsOfProductsOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 h-[30px] flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-50 transition-colors">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Plastic Packaging Picture</label>
              <div className="relative">
                <Image size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={autoData.representativePicturePath ? getFileName(autoData.representativePicturePath) : 'Please upload Plastic Packaging Picture'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-24 text-[13px] text-slate-500 truncate" />
                {autoData.representativePicturePath ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.representativePicturePath} fileName="Plastic Packaging Picture" originalFileName={autoData.representativePictureOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('representativePicturePath', 'autoData')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('representativePicturePath', 'autoData')} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 h-[30px] flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-50 transition-colors">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Covering letter</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCCoveringLetter ? getFileName(generalInfo.partCCoveringLetter) : 'Please upload Covering Letter'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-24 text-[13px] text-slate-500 truncate" />
                {generalInfo.partCCoveringLetter ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCCoveringLetter} fileName="Covering Letter" hideText onChangeDocument={() => triggerSimpleUpload('partCCoveringLetter', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => handlePrepareLetter('coveringLetter')} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 h-[30px] flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-blue-600 bg-blue-50/50 border border-blue-200 hover:bg-blue-50 transition-colors">
                    <Sparkles size={14} /> Prepare
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Self Declaration</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCAuditedStatement ? getFileName(generalInfo.partCAuditedStatement) : 'Please upload Self Declaration'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-24 text-[13px] text-slate-500 truncate" />
                {generalInfo.partCAuditedStatement ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCAuditedStatement} fileName="Self Declaration" hideText onChangeDocument={() => triggerSimpleUpload('partCAuditedStatement', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => handlePrepareLetter('selfDeclaration')} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 h-[30px] flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-blue-600 bg-blue-50/50 border border-blue-200 hover:bg-blue-50 transition-colors">
                    <Sparkles size={14} /> Prepare
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Signature</label>
              <div className="relative">
                <PenTool size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCSignature ? getFileName(generalInfo.partCSignature) : 'Please upload Signature'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-24 text-[13px] text-slate-500 truncate" />
                {generalInfo.partCSignature ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCSignature} fileName="Signature" hideText onChangeDocument={() => triggerSimpleUpload('partCSignature', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('partCSignature', 'generalInfo')} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 h-[30px] flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-emerald-600 bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-50 transition-colors">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[16px] shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center">
              <Briefcase size={18} className="text-indigo-600" />
            </div>
            <h3 className="text-[17px] font-semibold text-slate-800">Business Details</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Type of Business <span className="text-red-500">*</span></label>
              <select
                name="typeOfBusiness"
                value={generalInfo.typeOfBusiness}
                onChange={handleGeneralChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-3 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                required
              >
                <option value="">Select</option>
                {TYPE_OF_BUSINESS_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Type of Company <span className="text-red-500">*</span></label>
              <select
                name="typeOfCompany"
                value={generalInfo.typeOfCompany}
                onChange={handleGeneralChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-3 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                required
              >
                <option value="">Select</option>
                {TYPE_OF_COMPANY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-1">
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Registered Address Line 1 <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  name="registeredAddressLine1"
                  value={generalInfo.registeredAddressLine1}
                  onChange={handleGeneralChange}
                  type="text"
                  placeholder="Enter registered address"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  required
                />
                {autoData.gstDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                    <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                  </div>
                )}
              </div>
            </div>
            <div className="md:col-span-1">
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Registered Address Line 2</label>
              <input
                name="registeredAddressLine2"
                value={generalInfo.registeredAddressLine2}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter (optional)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={generalInfo.isSameAsRegisteredAddress}
                  onChange={(e) => setGeneralInfo(prev => ({ ...prev, isSameAsRegisteredAddress: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-[13px] font-medium text-slate-700">Plant/Unit Address is same as Registered Address</span>
              </label>
            </div>
            
            {!generalInfo.isSameAsRegisteredAddress && (
              <>
                <div className="md:col-span-1">
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Plant/Unit Address <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      name="plantAddress"
                      value={generalInfo.plantAddress}
                      onChange={handleGeneralChange}
                      type="text"
                      placeholder="Enter Plant/Unit Address"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                      required
                    />
                    {autoData.unitGstDoc && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                        <LocalFilePreview filePath={autoData.unitGstDoc} fileName="Unit GST Document" originalFileName={autoData.unitGstOriginalName} hideText onChangeDocument={() => handleChangeDocument('unit_gst')} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Unit GST Number <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      name="unitGst"
                      value={generalInfo.unitGst}
                      onChange={handleGeneralChange}
                      type="text"
                      placeholder="Enter Unit GST"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-4 uppercase text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                      required
                    />
                    {autoData.unitGstDoc && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                        <LocalFilePreview filePath={autoData.unitGstDoc} fileName="Unit GST Document" originalFileName={autoData.unitGstOriginalName} hideText onChangeDocument={() => handleChangeDocument('unit_gst')} />
                      </div>
                    )}
                  </div>
                  {autoData.unitGstDoc ? (
                    <UploadedFilePreview
                      filePath={autoData.unitGstDoc}
                      prefix="Certificate from documents"
                      suffix="— uploaded automatically in Part A"
                    />
                  ) : null}
                </div>
                {!autoData.unitGstDoc && (
                  <div className="md:col-span-1">
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Upload Unit GST Certificate <span className="text-red-500">*</span></label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) await persistPartCFile(file, 'unitGstDoc');
                      }}
                      className="w-full text-[13px] text-slate-700"
                      required
                    />
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">State/UT <span className="text-red-500">*</span></label>
                <select
                  name="stateUt"
                  value={generalInfo.stateUt}
                  onChange={handleGeneralChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-3 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  required
                >
                  <option value="">Select</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">District <span className="text-red-500">*</span></label>
                <input
                  name="district"
                  value={generalInfo.district || ''}
                  onChange={handleGeneralChange}
                  type="text"
                  placeholder="Enter district"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] px-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Designation <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    name="authDesignation"
                    value={generalInfo.authDesignation}
                    onChange={handleGeneralChange}
                    type="text"
                    placeholder="e.g. Director, Manager"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 pt-1">
              <h4 className="text-[12px] text-slate-400 mb-3 uppercase tracking-wider">Authorised Person Details & Set Password</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={generalInfo.password}
                      onChange={handleGeneralChange}
                      placeholder="Enter Password (min 8 chars)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-10 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Confirm Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={generalInfo.confirmPassword}
                      onChange={handleGeneralChange}
                      placeholder="Confirm Password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-10 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[16px] shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <h3 className="text-[17px] font-semibold text-slate-800">Contact Details</h3>
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-medium border border-blue-100 ml-2">Step 1 — User Verification</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Email Address <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Enter Email Address"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Mobile Number <span className="text-red-500">*</span></label>
              <div className="relative">
                <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={mobile}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\\D/g, '');
                    if (val.length <= 10) setMobile(val);
                  }}
                  type="tel"
                  placeholder="Enter Mobile Number"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl h-[42px] pl-[38px] pr-4 text-[13px] text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  required
                />
              </div>
            </div>
          </div>
        </div>"""

start_pattern = r'        \{\!registrationComplete && \(\n          <>\n        <div className="bg-white rounded-xl'
end_pattern = r'        \{\!registrationComplete && \(\n          <div\n            className=\{`rounded-xl border'

match_start = re.search(start_pattern, content)
match_end = re.search(end_pattern, content)

if match_start and match_end:
    start_idx = match_start.start()
    end_idx = match_end.start()
    
    prefix = content[:start_idx]
    suffix = content[end_idx:]
    
    new_content = prefix + "        {!registrationComplete && (\n          <>\n" + new_ui + "\n          </>\n        )}\n\n" + suffix
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully replaced UI using python regex script.")
else:
    print("Could not find patterns.")
    if not match_start:
        print("Start pattern not found.")
    if not match_end:
        print("End pattern not found.")
