import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/apiError.js';
import {User} from '../models/user.model.js';
import {uploadOnCloudinary} from '../utils/cloudinary.js';
import {ApiResponse} from '../utils/ApiResponse.js';


const genereateAccessAndRefreshTokens= async(userId)=>{
    try {
        const user = await User.findById(userId);
        const refreshToken= user.generateRefreshToken()
        const accessToken = user.generateAccessToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false});
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500,"something went wrong while generating refresh and access tokens")
    }
};


const registerUser = asyncHandler(async (req,res)=>{
    const {userName,fullname,email,password} = req.body;
    console.log("email: ", email);

    if (
        [fullname,email,password,userName].some((field)=>
        field?.trim()==="")
    ) {
        throw new ApiError(400,"All field are required");
    }

    const existedUser = await User.findOne({
        $or:[{ userName}, { email}]
    })
    if (existedUser) {
        throw new ApiError(400,"User already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required");
    }
    let coverImageLocalPath;

    if(req.files &&Array.isArray(req.files.coverImage) && req.files.coverImage.length >0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath) ;
    const coverImage = await uploadOnCloudinary(coverImageLocalPath) ;

    if(!avatar){
        throw new ApiError(400,"Avatar is required");
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName :userName.toLowerCase()

    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(400,"Something went wrong while creating the user");
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User created successfully"
        )
    )
})

const loginUser = asyncHandler(async (req,res)=>{
    const {userName,email,password}= req.body;

    if(!userName || !email){
        throw new ApiError(400,"All field are required");
    }
    const user = await  User.findOne({
        $or :[{userName},{email}]
    })
    if(!user){
        throw new ApiError(400,"User not found");
    }
    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid){
        throw new ApiError(400,"Password is not correct");
    }

    const {accessToken, refreshToken}=await genereateAccessAndRefreshTokens(user._id)
    const loggedInUser = await User.findOne(user._id).select("-password -refreshToken")
    const options={
        httpOnly: true,
        secure : true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,refreshToken,accessToken
            },
            "User logged in successfully"
        )
    )




})

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        },
        {
            new :true
        }
    )

    const options={
        httpOnly: true,
        secure : true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(
            200,
            {},
            "User logged out successfully"))
})

export {registerUser,loginUser,logoutUser}