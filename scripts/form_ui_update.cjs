const fs = require('fs');

const path = 'src/pages/CpcbRegistrationPage.jsx';
let content = fs.readFileSync(path, 'utf8');

const newFormCode = `        <div className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200/60 p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Box size={18} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">General Information</h3>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-100">Step 2 \u2014 CPCB portal fields</span>
          </div>
          <p className="text-[13px] text-slate-500 mb-6 font-medium">
            Company Details \u2014 Blank fields from CPCB portal. Fill manually if documents are not uploaded.
          </p>

          <h4 className="text-[13px] font-bold text-slate-800 mb-4 uppercase tracking-wider">Extracted Details (Verify/Edit)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="gstin" value={autoData.gstin || ''} onChange={(e) => setAutoData(prev => ({...prev, gstin: e.target.value}))} className={iconLockedInputClass} required />
                {autoData.gstDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company PAN *</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="companyPan" value={autoData.companyPan || ''} onChange={(e) => setAutoData(prev => ({...prev, companyPan: e.target.value}))} className={iconLockedInputClass} required />
                {autoData.companyPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.companyPanDocumentPath} fileName="Company PAN" originalFileName={autoData.companyPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('company_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="companyName" value={autoData.companyName || ''} onChange={(e) => setAutoData(prev => ({...prev, companyName: e.target.value}))} className={iconLockedInputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person Name *</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="authName" value={autoData.authName || ''} onChange={(e) => setAutoData(prev => ({...prev, authName: e.target.value}))} className={iconLockedInputClass} required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person PAN *</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="authPan" value={autoData.authPan || ''} onChange={(e) => setAutoData(prev => ({...prev, authPan: e.target.value}))} className={iconLockedInputClass} required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person DOB *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="date" name="authDob" value={autoData.authDob || ''} onChange={(e) => setAutoData(prev => ({...prev, authDob: e.target.value}))} className={iconLockedInputClass} required />
                {autoData.personPanDocumentPath && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                    <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CIN (If Applicable)</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="cin" value={autoData.cin || ''} onChange={(e) => setAutoData(prev => ({...prev, cin: e.target.value}))} className={\`\${iconLockedInputClass} uppercase pr-8\`} />
                {autoData.cinDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.cinDocumentPath} fileName="CIN Document" originalFileName={autoData.cinOriginalName} hideText onChangeDocument={() => handleChangeDocument('cin')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IEC (If Applicable)</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="iec" value={autoData.iec || ''} onChange={(e) => setAutoData(prev => ({...prev, iec: e.target.value}))} className={\`\${iconLockedInputClass} uppercase pr-8\`} />
                {autoData.iecDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.iecDocumentPath} fileName="IEC" originalFileName={autoData.iecOriginalName} hideText onChangeDocument={() => handleChangeDocument('iec')} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Details of Products</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={autoData.detailsOfProductsPath ? getFileName(autoData.detailsOfProductsPath) : 'Please upload Details of Products'} disabled className={\`\${iconLockedInputClass} text-slate-500 pr-8 truncate\`} />
                {autoData.detailsOfProductsPath ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.detailsOfProductsPath} fileName="Details of Products" originalFileName={autoData.detailsOfProductsOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm uppercase tracking-wide">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Plastic Packaging Picture</label>
              <div className="relative">
                <Image size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={autoData.representativePicturePath ? getFileName(autoData.representativePicturePath) : 'Please upload Plastic Packaging Picture'} disabled className={\`\${iconLockedInputClass} text-slate-500 pr-8 truncate\`} />
                {autoData.representativePicturePath ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={autoData.representativePicturePath} fileName="Plastic Packaging Picture" originalFileName={autoData.representativePictureOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('representativePicturePath', 'autoData')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('representativePicturePath', 'autoData')} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm uppercase tracking-wide">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Covering letter</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCCoveringLetter ? getFileName(generalInfo.partCCoveringLetter) : 'Please upload Covering Letter'} disabled className={\`\${iconLockedInputClass} text-slate-500 pr-8 truncate\`} />
                {generalInfo.partCCoveringLetter ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCCoveringLetter} fileName="Covering Letter" hideText onChangeDocument={() => triggerSimpleUpload('partCCoveringLetter', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => handlePrepareLetter('coveringLetter')} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm uppercase tracking-wide">
                    <Sparkles size={14} /> Prepare
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Self Declaration</label>
              <div className="relative">
                <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCAuditedStatement ? getFileName(generalInfo.partCAuditedStatement) : 'Please upload Self Declaration'} disabled className={\`\${iconLockedInputClass} text-slate-500 pr-8 truncate\`} />
                {generalInfo.partCAuditedStatement ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCAuditedStatement} fileName="Self Declaration" hideText onChangeDocument={() => triggerSimpleUpload('partCAuditedStatement', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => handlePrepareLetter('selfDeclaration')} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm uppercase tracking-wide">
                    <Sparkles size={14} /> Prepare
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Signature</label>
              <div className="relative">
                <PenTool size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={generalInfo.partCSignature ? getFileName(generalInfo.partCSignature) : 'Please upload Signature'} disabled className={\`\${iconLockedInputClass} text-slate-500 pr-8 truncate\`} />
                {generalInfo.partCSignature ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <LocalFilePreview filePath={generalInfo.partCSignature} fileName="Signature" hideText onChangeDocument={() => triggerSimpleUpload('partCSignature', 'generalInfo')} />
                  </div>
                ) : (
                  <button type="button" onClick={() => triggerSimpleUpload('partCSignature', 'generalInfo')} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm uppercase tracking-wide">
                    <UploadCloud size={14} /> Upload
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200/60 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Briefcase size={18} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Business Details</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Business *</label>
              <select
                name="typeOfBusiness"
                value={generalInfo.typeOfBusiness}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                required
              >
                <option value="">Select</option>
                {TYPE_OF_BUSINESS_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Company *</label>
              <select
                name="typeOfCompany"
                value={generalInfo.typeOfCompany}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                required
              >
                <option value="">Select</option>
                {TYPE_OF_COMPANY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address Line 1 *</label>
              <div className="relative">
                <input
                  name="registeredAddressLine1"
                  value={generalInfo.registeredAddressLine1}
                  onChange={handleGeneralChange}
                  type="text"
                  placeholder="Enter registered address"
                  className={\`\${lockedInputClass} pr-8\`}
                  required
                />
                {autoData.gstDocumentPath && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                    <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                  </div>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address Line 2</label>
              <input
                name="registeredAddressLine2"
                value={generalInfo.registeredAddressLine2}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter (optional)"
                className={lockedInputClass}
              />
            </div>
            <div className="md:col-span-2 mt-1 mb-1">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={generalInfo.isSameAsRegisteredAddress}
                  onChange={(e) => setGeneralInfo(prev => ({ ...prev, isSameAsRegisteredAddress: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Plant/Unit Address is same as Registered Address</span>
              </label>
            </div>
            
            {!generalInfo.isSameAsRegisteredAddress && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plant/Unit Address *</label>
                  <div className="relative">
                    <input
                      name="plantAddress"
                      value={generalInfo.plantAddress}
                      onChange={handleGeneralChange}
                      type="text"
                      placeholder="Enter Plant/Unit Address"
                      className={\`\${inputClass} pr-8\`}
                      required
                    />
                    {autoData.unitGstDoc && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white pr-2">
                        <LocalFilePreview filePath={autoData.unitGstDoc} fileName="Unit GST Document" originalFileName={autoData.unitGstOriginalName} hideText onChangeDocument={() => handleChangeDocument('unit_gst')} />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit GST Number *</label>
                  <div className="relative">
                    <input
                      name="unitGst"
                      value={generalInfo.unitGst}
                      onChange={handleGeneralChange}
                      type="text"
                      placeholder="Enter Unit GST"
                      className={\`\${inputClass} uppercase pr-8\`}
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
                      suffix="\u2014 uploaded automatically in Part A"
                    />
                  ) : null}
                </div>
                {!autoData.unitGstDoc && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Upload Unit GST Certificate *</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) await persistPartCFile(file, 'unitGstDoc');
                      }}
                      className={inputClass}
                      required
                    />
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State/UT *</label>
                <select
                  name="stateUt"
                  value={generalInfo.stateUt}
                  onChange={handleGeneralChange}
                  className={lockedSelectClass}
                  required
                >
                  <option value="">Select</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">District *</label>
                <input
                  name="district"
                  value={generalInfo.district || ''}
                  onChange={handleGeneralChange}
                  type="text"
                  placeholder="Enter district"
                  className={lockedInputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    name="authDesignation"
                    value={generalInfo.authDesignation}
                    onChange={handleGeneralChange}
                    type="text"
                    placeholder="e.g. Director, Manager"
                    className={iconLockedInputClass}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 pt-2 pb-2">
              <h4 className="text-[13px] font-bold text-slate-800 mb-4 uppercase tracking-wider">Authorised Person Details & Set Password</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={generalInfo.password}
                      onChange={handleGeneralChange}
                      placeholder="Enter Password (min 8 chars)"
                      className={iconInputClass}
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={generalInfo.confirmPassword}
                      onChange={handleGeneralChange}
                      placeholder="Confirm Password"
                      className={iconInputClass}
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200/60 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield size={18} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Contact Details</h3>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-100">Step 1 \u2014 User Verification</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Enter Email Address"
                  className={iconLockedInputClass}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={mobile}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\\D/g, '');
                    if (val.length <= 10) setMobile(val);
                  }}
                  type="tel"
                  placeholder="Enter Mobile Number"
                  className={iconLockedInputClass}
                  required
                />
              </div>
            </div>
          </div>
        </div>`;

const startIdx = content.indexOf('        <div>\\n          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">');
const endIdx = content.indexOf('        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-5 mb-8">');

if (startIdx === -1 || endIdx === -1) {
  console.log('Could not find start or end index.');
  console.log('startIdx', startIdx);
  console.log('endIdx', endIdx);
  process.exit(1);
}

const newContent = content.substring(0, startIdx) + newFormCode + '\\n' + content.substring(endIdx);
fs.writeFileSync(path, newContent, 'utf8');
console.log('Updated CpcbRegistrationPage.jsx');
