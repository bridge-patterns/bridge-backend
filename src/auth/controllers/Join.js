const User = require("../models/User");
const Candidate = require("../models/Candidate");
const Collaborator = require("../models/Collaborator");
const HTTPStatus = require("http-status");
const constants = require("../config/constants");
const privileges = require("../utils/privileges");
const transporter = require("../services/mailer");
const templates = require("../utils/email.templates");
const msgs = require("../utils/email.msgs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const validateRegisterInput = require("../utils/validations.register");
const validateLoginInput = require("../utils/validations.login");
const validateForgotPwdInput = require("../utils/validations.forgot");
const validatePwdUpdateInput = require("../utils/validations.update.pwd");
const validateCandidateInput = require("../utils/validations.candidate");

const join = {
    listAll: async(req, res) => {
        try {
            const users = await User.find();
            return res
                .status(HTTPStatus.OK)
                .json({ success: true, message: "Users fetched successfully", users });
        } catch (e) {
            return res
                .status(HTTPStatus.BAD_REQUEST)
                .json({ success: false, message: "Some Error" });
        }
    },

    listOne: async(req, res) => {
        User.find({ _id: req.params.id }).exec((err, user) => {
            if (err) {
                return res.json({ success: false, message: "Some Error" });
            }
            if (user.length) {
                return res.json({
                    success: true,
                    message: "User fetched by id successfully",
                    user,
                });
            } else {
                return res.json({
                    success: false,
                    message: "User with the given id not found",
                });
            }
        });
    },



    forgotPassword: (req, res) => {
        console.log("the email who forgot is  " + req.body.email);

        const { errors, isValid } = validateForgotPwdInput(req.body.email);
        if (!isValid) {
            return res.status(400).json(errors);
        }
        console.log("reaching forgotPassword");
        console.log("the email is here:" + req.body.email);

        const token = crypto.randomBytes(20).toString("hex");

        let query = { email: req.body.email };
        let updateDetails = {
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 3600000,
        };
        User.findOneAndUpdate(query, updateDetails, (error, response) => {
            if (error) {
                return res.status(400).json({ email: "Email does not exist" });
            } else if (response) {
                const mailOptions = {
                    from: `info@airqo.net`,
                    to: `${req.body.email}`,
                    subject: `Link To Reset Password`,
                    text: `${msgs.recovery_email(token)}`,
                };
                //we shall review other third party libraries for making emails....^^

                console.log("sending mail");

                //deliver the message object using sendMail
                transporter.sendMail(mailOptions, (err, response) => {
                    if (err) {
                        console.error("there was an error: ", err);
                        return res.status(500).json({ email: "unable to send email" });
                    } else {
                        console.log("here is the res: ", response);
                        return res.status(200).json({ email: "recovery email sent" });
                    }
                });
                //return res.status(HTTPStatus.OK).json(response);
            } else {
                return res.status(400).json({ email: "unable to send email" });
            }
        });
    },

    registerUser: (req, res) => {
        console.log(process.env.ATLAS_URI);

        const { errors, isValid } = validateRegisterInput(req.body);

        if (!isValid) {
            return res
                .status(400)
                .json({ success: false, errors, message: "validation error" });
        }
        console.log("the values coming in: ")
        console.dir(req.body)
        User.findOne({ email: req.body.email }).then((user) => {
            if (user) {
                return res
                    .status(400)
                    .json({ success: false, email: "Email already exists" });
            } else {
                const user = new User({
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    email: req.body.email,
                    userName: req.body.userName,
                    password: req.body.password,
                });
                user.save((error, savedData) => {
                    if (error) {
                        return console.log(error);
                    } else {
                        //sending the confirmation email to the user
                        const mailOptions = {
                            from: `info@airqo.net`,
                            to: `${user.email}`,
                            subject: "Welcome to AirQo",
                            text: msgs.welcome,
                        };

                        transporter.sendMail(mailOptions, (err, response) => {
                            if (err) {
                                console.error("there was an error: ", err);
                            } else {
                                console.log("here is the res: ", response);
                                res.status(200).json({
                                    savedData,
                                    success: true,
                                    message: "user added successfully",
                                });
                            }
                        });
                    }
                });
            }
        });
    },

    registerCandidate: (req, res) => {
        //console.log(process.env.ATLAS_URI);
        const { errors, isValid } = validateCandidateInput(req.body);

        if (!isValid) {
            return res.status(400).json(errors);
        }
        console.log("past the error phase...");
        Candidate.findOne({ email: req.body.email }).then((user) => {
            console.log("finding one....");
            if (user) {
                return res.status(400).json({ email: "Email already exists" });
            } else {
                const {
                    firstName,
                    lastName,
                    email,
                    jobTitle,
                    company,
                    phoneNumber,
                    country,
                    desc,
                } = req.body;
                const user = new Candidate({
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    jobTitle: jobTitle,
                    company: company,
                    phoneNumber: phoneNumber,
                    country: country,
                    desc: desc,
                });
                user.save((error, savedData) => {
                    if (error) {
                        return console.log(error);
                    } else {
                        //sending the confirmation email to the user
                        const mailOptions = {
                            from: `info@airqo.net`,
                            to: `${email}`,
                            subject: "AirQo Platform JOIN request",
                            text: msgs.joinRequest,
                        };

                        transporter.sendMail(mailOptions, (err, response) => {
                            if (err) {
                                console.error("there was an error: ", err);
                            } else {
                                console.log("here is the res: ", response);
                                res.status(200).json(savedData);
                            }
                        });
                    }
                });
            }
        });
    },

    //invoked when the user visits the confirmation url on the client
    confirmEmail: async(req, res) => {
        const { id } = req.params;
        User.findById(id)
            .then((user) => {
                //when the user does not exist in the DB
                if (!user) {
                    res.json({ msg: msgs.couldNotFind });
                }
                // The user exists but has not been confirmed. So we confirm them...
                else if (user && !user.emailConfirmed) {
                    User.findByIdAndUpdate(id, { confirmed: true })
                        .then(() => res.json({ msg: msgs.confirmed }))
                        .catch((err) => console.log(err));
                }
                //when the user has already confirmed their email address
                else {
                    res.json({ msg: msgs.alreadyConfirmed });
                }
            })
            .catch((err) => console.log(err));
    },

    loginUser: (req, res, next) => {
        console.log("we have reached loginUser....");
        const { errors, isValid } = validateLoginInput(req.body);

        if (!isValid) {
            return res.status(400).json(errors);
        }

        res.status(200).json(req.user.toAuthJSON());
        return next();
    },

    loginCollaborator: (req, res, next) => {
        res.status(200).json(req.colab.toAuthJSON());
        return next();
    },



    logout: async(req, res) => {
        try {
            await req.logout();
            req.session = null;
            return res.status(HTTPStatus.OK).send("successfully logged out");
        } catch (e) {
            return res.status(HTTPStatus.BAD_GATEWAY).json(e);
        }
    },
    resetPassword: (req, res, next) => {
        console.log("inside the reset password function...");
        console.log(`${req.params.resetPasswordToken}`);
        User.findOne({
            resetPasswordToken: req.params.resetPasswordToken,
            resetPasswordExpires: {
                $gt: Date.now(),
            },
        }).then((user) => {
            console.log("this is the user " + ` ${user}`);
            if (user == null) {
                res.status(403).send("password reset link is invalid or has expired");
            } else {
                res.status(200).send({
                    userName: user.userName,
                    message: "passworkd reset link a-ok",
                });
            }
        });
    },

    updatePasswordViaEmail: (req, res, next) => {
        const { errors, isValid } = validatePwdUpdateInput(req.body);
        if (!isValid) {
            return res.status(400).json(errors);
        }

        const { userName, password } = req.body;

        User.findOne({
            userName: userName,
            resetPasswordToken: req.body.resetPasswordToken,
            resetPasswordExpires: {
                $gt: Date.now(),
            },
        }).then((user) => {
            if (user == null) {
                console.log("password reset link is invalid or has expired");
                res
                    .status(403)
                    .json({ msg: "password reset link is invalid or has expired" });
            } else if (user != null) {
                user.update({
                    password: password,
                    resetPasswordToken: null,
                    resetPasswordExpires: null,
                });
                console.log("password updated");
                res.status(200).json({ msg: "password updated" });
            } else {
                console.log("no user exists in db to update");
                res.status(401).json({ msg: "no user exists in db to update" });
            }
        });
    },

    updatePassword: (req, res) => {
        //updating the routes with tim
        User.findByIdAndUpdate({ _id: req.body.id },
            req.body,
            (err, result) => {
                if (err) {
                    res.status(500).json({ message: "server error", err, success: false });
                } else if (results) {
                    res.status(200).json({ message: "password updated", success: true, result });
                } else {
                    res.status(400).json({ message: "user does not exist in the database", success: false })
                }
            }
        )
    }
};

module.exports = join;