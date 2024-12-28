export default function SongCard(){
    return (
        <div className="border border-white p-1">
            <div className="flex justify-around">
                <div>image</div>
                <div>title</div>
            </div>
            <div className="flex justify-start">
                <div>--- ^ ---</div>
                <div>count</div>
            </div>
        </div>
    )
}