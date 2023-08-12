const { User } = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { SECRET_KEY } = process.env;
const gravatar = require("gravatar");
const Jimp = require("jimp");
const path = require("path");
const fs = require("fs/promises");
const { nanoid } = require("nanoid");
const sendEmail = require("../middleware/sendEmail");

const register = async (req, res) => {
  const { password, email, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const avatarURL = gravatar.url(email);
  const verificationCode = nanoid();

  const user = await User.create({
    password: hashedPassword,
    email,
    name,
    avatar_url: avatarURL,
    verificationToken: verificationCode,
  });
  try {
    const { subscription, email } = user;
    const mail = {
      to: email,
      subject: "Verify your email",
      html: `<a href="http://localhost:3000/users/verify/${verificationCode}">Here</a>`,
    };
    await sendEmail(mail);
    res.status(201).json({ user: { email, subscription } });
  } catch (error) {
    console.log(error);
  }
};

const login = async (req, res) => {
  const { password, email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(401).json({ message: "Email or password is wrong" });
    return;
  }
  const comparePassword = await bcrypt.compare(password, user.password);
  if (!comparePassword) {
    res.status(401).json({ message: "Email or password is wrong" });
    return;
  }
  const { subscription } = user;
  const payload = {
    id: user._id,
  };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "24h" });
  res.status(200).json({ token, user: { email, subscription } });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: "" });
  return res.status(204).send();
};

const current = async (req, res) => {
  const { email, subscription } = req.user;
  return res.status(200).json({ email, subscription });
};

const avatarsDir = path.join(__dirname, "../", "public", "avatars");

const updateAvatar = async (req, res) => {
  const { _id } = req.user;
  const { path: tempUpload, originalname } = req.file;
  const extension = originalname.split(".").pop();
  const filename = `${_id}.${extension}`;
  const resultUpload = path.join(avatarsDir, filename);
  try {
    const image = await Jimp.read(tempUpload);
    await image.resize(250, 250).write(resultUpload);
    await fs.unlink(tempUpload);
  } catch (error) {
    console.error("Error resizing avatar:", error);
  }
  const avatarURL = path.join("avatars", filename);
  await User.findByIdAndUpdate(_id, { avatar_url: avatarURL });
  return res.status(200).json({ avatarURL: avatarURL });
};

const verifyEmail = async (req, res) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });
  if (!user) {
    res.status(404).json({ message: "User not found" });
  }
  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: "",
  });
  res.status(200).json({ message: "Verification successful" });
};

const resendVerifyEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.email) {
      res.status(400).json({ message: "missing required field email" });
    }
    await User.findByIdAndUpdate(user._id, {
      verify: true,
    });
    if (user.verify) {
      res.status(400).json({ message: "Verification has already been passed" });
    }
    const mail = {
      to: email,
      subject: "Verify your email",
      html: `<a href="http://localhost:3000/users/verify/${user.verificationToken}">Follow Here</a>`,
    };
    await sendEmail(mail);
    res.status(201).json({ message: "Verify email has been send" });
  } catch (error) {
    console.error("Error resending verification email:", error);
  }
};

module.exports = {
  register,
  login,
  logout,
  current,
  updateAvatar,
  verifyEmail,
  resendVerifyEmail,
};
