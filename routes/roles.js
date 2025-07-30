const express = require('express');
const router = express.Router();
const Employee = require('../models/Employees');
const authenticate = require('../middleware/authenticate');
const Account = require('../models/Account');
const { default: Role } = require('../models/Role');
const hasAccess = require('../middleware/hasAccess');

router.use(authenticate);


router.get('/',async(req,res)=>{
    try{
        const roles = await Role.find().select('_id name')
        res.status(200).send(roles)
    }catch(err){
        res.send(err)
        console.log(err)
    }
})

router.post('/create',hasAccess('isAdmin'),async(req,res)=>{
    try{
        const {name} = req.body;
        const {userId} = req.user;
        const account = await Account.findById(userId).select('businessRef');
        const newRole = new Role({name,businessRef: account.businessRef})
        await newRole.save()
        res.status(200).send(`${name} role added`)
    }catch(err){
        res.send(err)
        console.log(err)
    }
})

router.put('/edit',hasAccess('isAdmin'),async(req,res)=>{
    try{
        const {id,name} = req.body;
        const role = await Role.findById(id)
        let oldRole = role.name
        role.name = name
        await role.save()
        res.status(200).send(`${oldRole} updated to ${role.name}`)
    }catch(err){
        res.send(err)
        console.log(err)
    }
})

module.exports = router