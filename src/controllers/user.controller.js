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
            $unset:{
                refreshToken:1
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

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword,newPassword}=req.body;
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if(!isPasswordCorrect){
        throw new ApiError(400,"Password is not correct");
    }
    user.password =  newPassword;
    await user.save({validateBeforeSave:false})

    return res
   .status(200)
   .json(
        new ApiResponse(
            200,
            {},
            "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req,res)=>{
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {},
            "password changed successfully"))
})

const updateUserAvatar = asyncHandler( async (req,res)=>{
    const avatarLocalPath = req.files?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400,"avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar.url) {
        throw new ApiError(400,"error while uploading file")
    }

    const user =await User.findByIdAndUpdate(
        req.user._id,
        { 
            $set: {
                avatar: avatar.url
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "avatar updated successfully"))
})

const getUserChannelProfile = asyncHandler( async (req,res)=>{
    const {username}= req.params
    if(!username?.trim()){
        throw new ApiError(400,"username is required")
    }

    const channel =await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{$size:"$subscribers"},
                channelsSubscribedToCount:{$size:"$subscribedTo"},
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.body?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }

            }
        },
        {
            $project:{
                fullName:1,
                userName:1,
                avatar:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                coverImage:1
            }
        }
        
    ])

    if(!channel?.length){
        throw new ApiError(400,"channel does not exist")
    }

    return res
   .status(200)
   .json(
    new ApiResponse(
        200,
        channel[0],
        "channel profile fetched successfully"))
   
})
export {registerUser,loginUser,logoutUser,changeCurrentPassword,getCurrentUser,updateUserAvatar,getUserChannelProfile}