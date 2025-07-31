const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');
const Branch = require('../models/Branch');
const Employees = require('../models/Employees');

const router = express.Router();
router.use(authenticate);

router.get('/',hasAccess('isAdmin'),async (req,res)=>{
    try{
        const Branches = await Branch.find()
        res.status(200).json(Branches)
    }catch(err){
        console.log(err)
        res.send(err)
    }
})

router.post('/add-branch',hasAccess('isAdmin'),async (req,res)=>{
    try{
        const {name,address,phone=null,code} = req.body
        if(!name){
            throw error("Name is required")
        }
        if(!address){
            throw error("Address is required")
        }
        const branchData = {
            name,
            address,
            phone,
            branchCode:code,
            managers: null,
            isActive:true
        }
        const branch = new Branch(branchData);
        const res = await branch.save()

        return res.json({message:"Branch added successfully",branch:res})

    }catch(err){
        console.log(err)
        res.json(err)
    }
})

router.put('/edit',hasAccess('isAdmin'), async (req,res)=>{
    try{
        const {id,address,name,isActive,phone} = req.body
        const branch = await Branch.findById(id);
        if (!branch){
            throw new error("Branch not found")
        }
        if (address){
            branch.address = address
        }
        if(name){
            branch.name = name
        }
        if(branch.isActive != isActive){
            branch.isActive = isActive
        }
        if(phone){
            branch.phone = phone
        }

      return  res.status(200).json("Branch updated successfully")

    }catch(err){
        console.log(err)
      return res.status(400).json(err)
    }
})

router.put('/assign-manager', hasAccess('isAdmin'), async (req, res) => {
  try {
    const { branchId, managerIds } = req.body; // Now expects array
    console.log('branch id:', branchId)
    console.log('managers:', managerIds)
    const branch = await Branch.findById(branchId);
    console.log(branch)
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    // Handle multiple manager IDs
    const managerArray = Array.isArray(managerIds) ? managerIds : [managerIds];
    
    for (const managerId of managerArray) {
      const manager = await Employees.findById(managerId);
      
      if (manager) {
        manager.branchCode = branch.branchCode;
        
        if (!Array.isArray(branch.managers)) {
          branch.managers = [];
        }
        
        if (!branch.managers.includes(manager._id)) {
          branch.managers.push(manager._id);
        }
        
        await manager.save();
      }
    }

    await branch.save();
    return res.status(200).json({ message: `Managers assigned to branch ${branch.name}` });
  } catch (err) {
    console.error('Assign manager error:', err);
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;