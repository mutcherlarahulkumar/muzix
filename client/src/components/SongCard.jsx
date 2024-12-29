export default function SongCard({item}){
    return (
        <div className="border border-white p-1">
            <div className="flex justify-around">
                <div>
                    <img src={item.thumburl} alt="image" style={{ width: '180px', height: '100px' }} />
                    {console.log(item)}
                </div>
                <div>{item.title}</div>
            </div>
            <div className="flex justify-start">
                <div>--- ^ ---</div>
                <div>count</div>
            </div>
        </div>
    )
}